'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Artist, Song, Album } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { Play, Shuffle, Mic2, ArrowLeft, List, LayoutGrid } from 'lucide-react';
import Image from 'next/image';

export default function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('echonest-artist-view') : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('echonest-artist-view', v);
  };

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [artistRes, songsRes, albumsRes] = await Promise.all([
        supabase.from('artists').select('*').eq('id', id).single(),
        supabase.from('songs').select('*').eq('artist_id', id).order('title'),
        supabase.from('albums').select('*').eq('artist_id', id).order('year', { ascending: false }),
      ]);
      if (artistRes.data) setArtist(artistRes.data);
      if (songsRes.data) setSongs(songsRes.data);
      if (albumsRes.data) setAlbums(albumsRes.data);
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gradient-to-b from-accent/20 to-background p-6 lg:p-8">
        <button onClick={() => router.back()} className="lg:hidden mb-4 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-48 h-48 rounded-full bg-card overflow-hidden flex-shrink-0 shadow-2xl">
            {artist?.image_url ? (
              <Image src={artist.image_url} alt={artist.name} width={192} height={192} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-purple-600/30">
                <Mic2 className="w-16 h-16 text-accent" />
              </div>
            )}
          </div>
          <div className="flex-1 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Artist</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">{artist?.name || 'Loading...'}</h1>
            <p className="text-sm text-muted mt-2">{songs.length} songs · {albums.length} albums</p>

            <div className="flex items-center gap-3 mt-4">
              <Button onClick={() => songs.length > 0 && play(songs[0], songs, 'library')} disabled={songs.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play all
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

      <div className="p-6 lg:p-8 space-y-10">
        {albums.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {albums.map((album) => (
                <MediaCard key={album.id} title={album.title} subtitle={album.year?.toString() || ''} imageUrl={album.cover_url} href={`/album/${album.id}`} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Songs</h2>
            {!loading && songs.length > 0 && (
              <div className="flex items-center gap-1">
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
          </div>
          {loading ? (
            view === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => <SongRowSkeleton key={i} />)}
              </div>
            )
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {songs.map((song) => (
                <SongCard key={song.id} song={song} songs={songs} />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {songs.map((song, i) => (
                <SongRow key={song.id} song={song} index={i} showIndex songs={songs} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
