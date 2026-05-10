'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Clock } from 'lucide-react';

export default function RecentlyPlayedPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('recently_played')
        .select('song:songs(*)')
        .order('played_at', { ascending: false })
        .limit(50);

      if (data) {
        const all = data.map((d: Record<string, unknown>) => d.song as Song).filter(Boolean);
        const unique = all.filter((s: Song, i: number, arr: Song[]) => arr.findIndex((x: Song) => x.id === s.id) === i);
        setSongs(unique);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">Recently Played</h1>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => <SongRowSkeleton key={i} />)}
        </div>
      ) : songs.length > 0 ? (
        <div className="space-y-0.5">
          {songs.map((song) => (
            <SongRow key={song.id} song={song} songs={songs} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Clock} title="Nothing here yet" description="Start playing music and your history will show up here" />
      )}
    </div>
  );
}
