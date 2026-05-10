'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { Heart, Play, Shuffle } from 'lucide-react';

export default function LikedSongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('likes')
        .select('song_id, song:songs(*)')
        .order('created_at', { ascending: false });

      if (data) {
        const s = data.map((d: Record<string, unknown>) => d.song as Song).filter(Boolean);
        setSongs(s);
        setLikedIds(new Set(data.map((d: Record<string, unknown>) => d.song_id as string)));
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleLike = async (songId: string) => {
    const supabase = createClient();
    if (likedIds.has(songId)) {
      await supabase.from('likes').delete().eq('song_id', songId);
      setLikedIds((prev) => { const n = new Set(prev); n.delete(songId); return n; });
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    }
  };

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
            <p className="text-sm text-muted mt-3">{songs.length} songs</p>
            <div className="flex items-center gap-3 mt-4">
              <Button onClick={() => songs.length > 0 && play(songs[0], songs, 'library')} disabled={songs.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="secondary" onClick={() => {
                if (songs.length > 0) {
                  const shuffled = [...songs].sort(() => Math.random() - 0.5);
                  play(shuffled[0], shuffled, 'library');
                }
              }} disabled={songs.length === 0}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8 pt-4">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => <SongRowSkeleton key={i} />)}
          </div>
        ) : songs.length > 0 ? (
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongRow key={song.id} song={song} index={i} showIndex songs={songs} isLiked={likedIds.has(song.id)} onLike={toggleLike} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Heart} title="No liked songs yet" description="Tap the heart icon on any song to add it here" />
        )}
      </div>
    </div>
  );
}
