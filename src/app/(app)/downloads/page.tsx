'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import {
  Download,
  Play,
  Shuffle,
  LayoutGrid,
  List,
  Music,
} from 'lucide-react';
import Link from 'next/link';

export default function DownloadsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem('echonest-downloads-view')
        : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined')
      localStorage.setItem('echonest-downloads-view', v);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('songs')
      .select('*')
      .eq('source', 'upload')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSongs(data as Song[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-emerald-600/20 to-background p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center flex-shrink-0 shadow-2xl">
            <Download className="w-16 h-16 text-white" />
          </div>
          <div className="flex-1 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Library
            </p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">Downloads</h1>
            <p className="text-muted-foreground mt-2">
              Audio files you&apos;ve uploaded — these play in the background
              on iPhone (Add to Home Screen first).
            </p>
            <p className="text-sm text-muted mt-3">{songs.length} songs</p>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4">
              <Button
                onClick={() => {
                  if (songs.length === 0) return;
                  play(songs[0], songs, 'library');
                }}
                disabled={songs.length === 0}
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (songs.length === 0) return;
                  const shuffled = [...songs].sort(() => Math.random() - 0.5);
                  play(shuffled[0], shuffled, 'library');
                }}
                disabled={songs.length === 0}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              <Link
                href="/upload"
                className="px-4 py-2 bg-card border border-border text-sm rounded-full hover:bg-card-hover transition-colors inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Add more
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Songs */}
      <div className="p-6 lg:p-8 pt-4 space-y-4">
        {!loading && songs.length > 0 && (
          <div className="flex items-center justify-end gap-1">
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
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <SongRowSkeleton key={i} />
              ))}
            </div>
          )
        ) : songs.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No downloads yet"
            description="Upload audio files on the Upload page — they show up here and play in the background on your phone."
          />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} songs={songs} />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                showIndex
                songs={songs}
                source="library"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
