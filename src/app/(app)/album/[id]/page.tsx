'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Album, Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { Play, Shuffle, Disc3, ArrowLeft } from 'lucide-react';
import Image from 'next/image';

export default function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [albumRes, songsRes] = await Promise.all([
        supabase.from('albums').select('*').eq('id', id).single(),
        supabase.from('songs').select('*').eq('album_id', id).order('track_number'),
      ]);
      if (albumRes.data) setAlbum(albumRes.data);
      if (songsRes.data) setSongs(songsRes.data);
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gradient-to-b from-purple-900/30 to-background p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          className="lg:hidden mb-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-48 h-48 rounded-xl bg-card overflow-hidden flex-shrink-0 shadow-2xl">
            {album?.cover_url ? (
              <Image src={album.cover_url} alt={album.title} width={192} height={192} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-accent/30">
                <Disc3 className="w-16 h-16 text-accent" />
              </div>
            )}
          </div>
          <div className="flex-1 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Album</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">{album?.title || 'Loading...'}</h1>
            <p className="text-muted-foreground mt-1">{album?.artist_name}</p>
            {album?.year && <p className="text-sm text-muted mt-1">{album.year}</p>}
            <p className="text-sm text-muted mt-1">{songs.length} songs</p>

            <div className="flex items-center gap-3 mt-4">
              <Button onClick={() => songs.length > 0 && play(songs[0], songs, 'album')} disabled={songs.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="secondary" onClick={() => {
                if (songs.length > 0) {
                  const shuffled = [...songs].sort(() => Math.random() - 0.5);
                  play(shuffled[0], shuffled, 'album');
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
            {Array.from({ length: 6 }).map((_, i) => <SongRowSkeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongRow key={song.id} song={song} index={i} showIndex songs={songs} source="album" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
