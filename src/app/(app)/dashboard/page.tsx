'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Playlist, Album } from '@/types';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRow } from '@/components/ui/SongRow';
import { CardSkeleton, SongRowSkeleton } from '@/components/ui/Skeleton';
import { usePlayerStore } from '@/store/player';
import { Clock, TrendingUp, ListMusic, Music, ExternalLink, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function DashboardPage() {
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Song[]>([]);
  const [ytTracks, setYtTracks] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      const [
        recentPlayedRes,
        recentAddedRes,
        ytRes,
        playlistsRes,
        albumsRes,
      ] = await Promise.all([
        supabase
          .from('recently_played')
          .select('song:songs(*)')
          .order('played_at', { ascending: false })
          .limit(10),
        supabase
          .from('songs')
          .select('*')
          .eq('source', 'upload')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('songs')
          .select('*')
          .eq('source', 'youtube_embed')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('playlists')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase
          .from('albums')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      if (recentPlayedRes.data) {
        const songs = recentPlayedRes.data
          .map((r: Record<string, unknown>) => r.song as Song)
          .filter(Boolean);
        const unique = songs.filter(
          (s: Song, i: number, arr: Song[]) =>
            arr.findIndex((x: Song) => x.id === s.id) === i
        );
        setRecentSongs(unique);
      }
      if (recentAddedRes.data) setRecentlyAdded(recentAddedRes.data);
      if (ytRes.data) setYtTracks(ytRes.data);
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

  const hasAnyContent =
    recentSongs.length > 0 ||
    recentlyAdded.length > 0 ||
    ytTracks.length > 0 ||
    playlists.length > 0 ||
    albums.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-10 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{greeting()}</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Here&apos;s what&apos;s playing in your world
        </p>
      </div>

      {/* Empty state */}
      {!loading && !hasAnyContent && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Music className="w-12 h-12 text-muted mx-auto mb-3" />
          <h2 className="text-lg font-semibold">Start your library</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Upload your music or add YouTube tracks to get started
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/upload"
              className="px-5 py-2 bg-accent text-white text-sm rounded-full hover:bg-accent-hover transition-colors"
            >
              Upload music
            </Link>
            <Link
              href="/import"
              className="px-5 py-2 bg-card border border-border text-sm rounded-full hover:bg-card-hover transition-colors"
            >
              Add from YouTube
            </Link>
          </div>
        </div>
      )}

      {/* Recently Added (uploaded songs) */}
      {(loading || recentlyAdded.length > 0) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-accent" />
              <h2 className="text-lg sm:text-xl font-semibold">Recently Added</h2>
            </div>
            <Link
              href="/library"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all
            </Link>
          </div>
          {loading ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <SongRowSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentlyAdded.slice(0, 5).map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  songs={recentlyAdded}
                  source="library"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recently Played */}
      {recentSongs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              <h2 className="text-lg sm:text-xl font-semibold">Recently Played</h2>
            </div>
            <Link
              href="/recent"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all
            </Link>
          </div>
          <div className="space-y-0.5">
            {recentSongs.slice(0, 5).map((song) => (
              <SongRow key={song.id} song={song} songs={recentSongs} source="library" />
            ))}
          </div>
        </section>
      )}

      {/* YouTube Tracks */}
      {ytTracks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-accent" />
              <h2 className="text-lg sm:text-xl font-semibold">From YouTube</h2>
            </div>
            <Link
              href="/import"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all
            </Link>
          </div>
          <div className="space-y-0.5">
            {ytTracks.slice(0, 5).map((song) =>
              song.youtube_kind === 'playlist' ? (
                <Link
                  key={song.id}
                  href={`/yt-playlist/${song.id}`}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-card-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-md bg-card overflow-hidden flex-shrink-0 relative">
                    {song.cover_url ? (
                      <Image
                        src={song.cover_url}
                        alt={song.title}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ListMusic className="w-4 h-4 text-muted" />
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 bg-red-600 text-white text-[8px] px-1 rounded-tl">
                      PL
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Playlist · {song.artist_name}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ) : (
                <SongRow
                  key={song.id}
                  song={song}
                  songs={ytTracks.filter((s) => s.youtube_kind !== 'playlist')}
                  source="library"
                />
              )
            )}
          </div>
        </section>
      )}

      {/* Your Playlists */}
      {playlists.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-accent" />
              <h2 className="text-lg sm:text-xl font-semibold">Your Playlists</h2>
            </div>
            <Link
              href="/library"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {playlists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.title}
                subtitle={playlist.description || 'Playlist'}
                imageUrl={playlist.cover_url}
                href={`/playlist/${playlist.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Albums */}
      {albums.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              <h2 className="text-lg sm:text-xl font-semibold">Your Albums</h2>
            </div>
            <Link
              href="/library"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.title}
                subtitle={album.artist_name}
                imageUrl={album.cover_url}
                href={`/album/${album.id}`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
