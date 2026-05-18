'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { BulkDownloadButton } from '@/components/ui/BulkDownloadButton';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { Heart, Play, Shuffle, LayoutGrid, List } from 'lucide-react';
import { SortMenu } from '@/components/ui/SortMenu';
import { sortSongs, SortKey } from '@/lib/songSort';

export default function LikedSongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('date_added_desc');
  const play = usePlayerStore((s) => s.play);
  const likedIds = useLikesStore((s) => s.likedIds);

  // Persist sort choice
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? (localStorage.getItem('echonest-liked-sort') as SortKey | null)
        : null;
    if (saved) setSortKey(saved);
  }, []);
  const setSortKeyPersisted = (k: SortKey) => {
    setSortKey(k);
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-liked-sort', k);
    }
  };

  // Remember the user's preferred view across sessions.
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem('echonest-liked-view')
        : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-liked-view', v);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('likes')
        .select('song:songs(*)')
        .order('created_at', { ascending: false });

      if (data) {
        const s = data.map((d: Record<string, unknown>) => d.song as Song).filter(Boolean);
        setSongs(s);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Reactively remove songs from the list when they're un-liked elsewhere,
  // then sort according to the user's choice.
  const visibleSongs = sortSongs(
    songs.filter((s) => likedIds.has(s.id)),
    sortKey,
  );

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-b from-pink-900/30 to-background p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-48 h-48 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-2xl">
            <Heart className="w-20 h-20 text-white fill-current" />
          </div>
          <div className="flex-1 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Playlist</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">Liked Songs</h1>
            <p className="text-sm text-muted mt-3">{visibleSongs.length} songs</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Button
                onClick={() => visibleSongs.length > 0 && play(visibleSongs[0], visibleSongs, 'library')}
                disabled={visibleSongs.length === 0}
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (visibleSongs.length > 0) {
                    const shuffled = [...visibleSongs].sort(() => Math.random() - 0.5);
                    play(shuffled[0], shuffled, 'library');
                  }
                }}
                disabled={visibleSongs.length === 0}
              >
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <BulkDownloadButton songs={visibleSongs} />
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8 pt-4 space-y-4">
        {!loading && visibleSongs.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <SortMenu value={sortKey} onChange={setSortKeyPersisted} />
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
              className={`p-2 rounded-lg transition-colors ${
                view === 'list'
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
              className={`p-2 rounded-lg transition-colors ${
                view === 'grid'
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => <SongRowSkeleton key={i} />)}
            </div>
          )
        ) : visibleSongs.length === 0 ? (
          <EmptyState icon={Heart} title="No liked songs yet" description="Tap the heart icon on any song to add it here" />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {visibleSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                songs={visibleSongs}
                onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleSongs.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                showIndex
                songs={visibleSongs}
                onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
