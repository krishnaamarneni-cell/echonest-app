'use client';

/**
 * For You — new songs suggested from what you actually listen to.
 *
 * Seeds are your most-played YouTube tracks; for each one we ask the proxy
 * for that song's "Mix" (YouTube's own radio for that track, the same engine
 * behind Up Next), then merge the results and drop anything you've already
 * heard. Using YouTube's recommender rather than rolling our own means the
 * suggestions are genuinely good from day one.
 *
 * Seeding from several songs rather than one keeps a single obsession from
 * dominating the whole page.
 */

import { useEffect, useState } from 'react';
import { YtTrackList, YtTrack } from '@/components/ui/YtTrackList';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkles, RefreshCw } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { ytVideoToSong } from '@/lib/ytSearch';
import { fetchRecommendations } from '@/lib/autoplayQueue';
import {
  fetchPlayHistory,
  rankSongsByPlays,
  withinDays,
  heardVideoIds,
} from '@/lib/listeningStats';

// Three seeds is the sweet spot: enough variety that the page isn't a
// single artist, few enough that we're not firing a dozen slow lookups.
const SEED_COUNT = 3;
const WINDOW_DAYS = 90;

interface Suggestions {
  tracks: YtTrack[];
  seeds: string[];
  error: string | null;
}

/**
 * Pure async build step — deliberately holds no React state so the effect
 * below can await it and only touch state afterwards.
 */
async function buildSuggestions(): Promise<Suggestions> {
  const plays = await fetchPlayHistory();
  const heard = heardVideoIds(plays);

  // minPlays = 1 here (unlike On Repeat): a single listen is still a signal
  // of taste, and we want seeds even for a light listener.
  const top = rankSongsByPlays(withinDays(plays, WINDOW_DAYS), 1)
    .filter((r) => r.song.youtube_id)
    .slice(0, SEED_COUNT);

  if (top.length === 0) return { tracks: [], seeds: [], error: null };

  const results = await Promise.all(
    top.map((t) => fetchRecommendations(t.song.youtube_id as string)),
  );

  // Interleave each seed's results so the first screen isn't one song's
  // radio, then drop duplicates and anything already heard.
  const merged: YtTrack[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...results.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of results) {
      const v = list[i];
      if (!v || seen.has(v.videoId) || heard.has(v.videoId)) continue;
      seen.add(v.videoId);
      merged.push({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
      });
    }
  }

  return {
    tracks: merged.slice(0, 40),
    seeds: top.map((t) => t.song.title),
    error:
      merged.length === 0
        ? "Couldn't get suggestions — the extractor didn't answer. It runs on your laptop, so check it's awake."
        : null,
  };
}

export default function ForYouPage() {
  const [tracks, setTracks] = useState<YtTrack[]>([]);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    let cancelled = false;
    buildSuggestions().then((res) => {
      if (cancelled) return;
      setTracks(res.tracks);
      setSeeds(res.seeds);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = () => {
    setLoading(true);
    setError(null);
    setRefreshKey((k) => k + 1);
  };

  const handlePlay = (index: number) => {
    const songs = tracks.map(ytVideoToSong);
    play(songs[index], songs, 'library');
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">For You</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {seeds.length > 0
              ? `New songs based on ${seeds.slice(0, 2).join(', ')}${seeds.length > 2 ? ' and more' : ''}`
              : 'New songs picked from what you listen to'}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <SongRowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : tracks.length > 0 ? (
        <YtTrackList items={tracks} view="list" onPlay={handlePlay} />
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Not enough listening history yet"
          description="Play a few songs and we'll start suggesting new ones based on your taste."
        />
      )}
    </div>
  );
}
