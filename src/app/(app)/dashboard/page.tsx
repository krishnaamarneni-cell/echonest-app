'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Playlist, Album } from '@/types';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRow } from '@/components/ui/SongRow';
import { CardSkeleton, SongRowSkeleton } from '@/components/ui/Skeleton';
import { usePlayerStore } from '@/store/player';
import { Clock, TrendingUp, ListMusic } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      const [songsRes, playlistsRes, albumsRes] = await Promise.all([
        supabase
          .from('recently_played')
          .select('song:songs(*)')
          .order('played_at', { ascending: false })
          .limit(10),
        supabase
          .from('playlists')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(6),
        supabase
          .from('albums')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      if (songsRes.data) {
        const songs = songsRes.data
          .map((r: Record<string, unknown>) => r.song as Song)
          .filter(Boolean);
        const unique = songs.filter(
          (s: Song, i: number, arr: Song[]) => arr.findIndex((x: Song) => x.id === s.id) === i
        );
        setRecentSongs(unique);
      }
      if (playlistsRes.data) setPlaylists(playlistsRes.data);
      if (albumsRes.data) setAlbums(albumsRes.data);
      setLoading(false);
    }

    loadData();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-6 lg:p-8 space-y-10 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">{greeting()}</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s playing in your world
        </p>
      </div>

      {/* Recently Played */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-semibold">Recently Played</h2>
          </div>
          <Link href="/recent" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            See all
          </Link>
        </div>
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        ) : recentSongs.length > 0 ? (
          <div className="space-y-0.5">
            {recentSongs.slice(0, 5).map((song) => (
              <SongRow key={song.id} song={song} songs={recentSongs} source="library" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Start playing music to see your history here
          </p>
        )}
      </section>

      {/* Your Playlists */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-semibold">Your Playlists</h2>
          </div>
          <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            See all
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : playlists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {playlists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.title}
                subtitle={`${playlist.song_count || 0} songs`}
                imageUrl={playlist.cover_url}
                href={`/playlist/${playlist.id}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Create your first playlist to get started
          </p>
        )}
      </section>

      {/* Albums */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-semibold">Your Albums</h2>
          </div>
          <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            See all
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : albums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.title}
                subtitle={album.artist_name}
                imageUrl={album.cover_url}
                href={`/album/${album.id}`}
                onPlay={() => {
                  if (album.songs?.length) {
                    play(album.songs[0], album.songs, 'album');
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Upload music to see your albums here
          </p>
        )}
      </section>
    </div>
  );
}
