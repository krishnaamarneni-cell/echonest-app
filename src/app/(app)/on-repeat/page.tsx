'use client';

/**
 * On Repeat — the songs you keep coming back to, like YouTube Music's
 * Replay or Spotify's On Repeat.
 *
 * Computed live from recently_played rather than stored as a real playlist
 * row, so it can never go stale and there's nothing to sync. The trade-off
 * is that it isn't editable — which matches how the equivalent playlists
 * behave on other services.
 */

import { useEffect, useMemo, useState } from 'react';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Repeat, Play } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import {
  fetchPlayHistory,
  rankSongsByPlays,
  withinDays,
  PlayEvent,
} from '@/lib/listeningStats';

// Last 30 days, matching how the big services scope "on repeat". Longer
// windows turn it into an all-time chart that barely moves.
const WINDOW_DAYS = 30;

export default function OnRepeatPage() {
  const [plays, setPlays] = useState<PlayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    let cancelled = false;
    fetchPlayHistory().then((data) => {
      if (cancelled) return;
      setPlays(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(
    () => rankSongsByPlays(withinDays(plays, WINDOW_DAYS)).slice(0, 50),
    [plays],
  );
  const songs = useMemo(() => ranked.map((r) => r.song), [ranked]);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">On Repeat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What you&apos;ve played most in the last {WINDOW_DAYS} days — updates itself.
          </p>
        </div>
        {songs.length > 0 && (
          <button
            onClick={() => play(songs[0], songs, 'library')}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <SongRowSkeleton key={i} />
          ))}
        </div>
      ) : ranked.length > 0 ? (
        <div className="space-y-0.5">
          {ranked.map((entry, i) => (
            <div key={entry.song.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <SongRow song={entry.song} index={i} showIndex songs={songs} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {entry.count} plays
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Repeat}
          title="Nothing on repeat yet"
          description={`Play a song more than once and it'll show up here. Looks at the last ${WINDOW_DAYS} days.`}
        />
      )}
    </div>
  );
}
