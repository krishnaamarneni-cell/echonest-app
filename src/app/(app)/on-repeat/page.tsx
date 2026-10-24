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
import { SongCard } from '@/components/ui/SongCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ViewToggle } from '@/components/ui/ViewToggle';
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
  const [view, setView] = useState<'list' | 'grid'>('list');
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

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem('echonest-repeat-view') : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('echonest-repeat-view', v);
  };

  const ranked = useMemo(
    () => rankSongsByPlays(withinDays(plays, WINDOW_DAYS)).slice(0, 50),
    [plays],
  );
  const songs = useMemo(() => ranked.map((r) => r.song), [ranked]);

  return (
    <div className="space-y-6 p-6 animate-fade-in lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">On Repeat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What you&apos;ve played most in the last {WINDOW_DAYS} days — updates itself.
          </p>
        </div>
        {songs.length > 0 ? (
          <button
            onClick={() => play(songs[0], songs, 'library')}
            className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </button>
        ) : null}
      </div>

      {ranked.length > 0 ? (
        <div className="flex justify-end">
          <ViewToggle view={view} onChange={setViewMode} />
        </div>
      ) : null}

      {loading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        )
      ) : ranked.length > 0 ? (
        view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
            {ranked.map((entry) => (
              <SongCard key={entry.song.id} song={entry.song} songs={songs} />
            ))}
          </div>
        ) : (
          /* Duration is hidden and the play count rides in the row's own
             trailing slot — previously it sat in an extra column outside the
             row, which squeezed the title down to a few characters. */
          <div className="space-y-0.5">
            {ranked.map((entry) => (
              <SongRow
                key={entry.song.id}
                song={entry.song}
                songs={songs}

                trailing={`${entry.count} plays`}
              />
            ))}
          </div>
        )
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
