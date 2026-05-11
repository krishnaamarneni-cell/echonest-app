'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Playlist, Album } from '@/types';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongCard } from '@/components/ui/SongCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Clock, TrendingUp, ListMusic, Music, ExternalLink, Smartphone, Disc, Mic } from 'lucide-react';
import Link from 'next/link';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue } from '@/lib/playlistQueue';

export default function DashboardPage() {
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Song[]>([]);
  const [ytTracks, setYtTracks] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [allPlaylistSongs, setAllPlaylistSongs] = useState<Song[]>([]);
  const [podcasts, setPodcasts] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-expect-error iOS-specific
        window.navigator.standalone === true;
      const dismissed = localStorage.getItem('echonest-bg-hint-dismissed');
      setShowInstallHint(!standalone && !dismissed);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      const [recentPlayedRes, recentAddedRes, ytRes, playlistsRes, albumsRes, podcastsRes] =
        await Promise.all([
          supabase
            .from('recently_played')
            .select('played_at, song:songs(*)')
            .order('played_at', { ascending: false })
            .limit(20),
          supabase
            .from('songs')
            .select('*')
            .eq('source', 'upload')
            .eq('content_type', 'music')
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('songs')
            .select('*')
            .eq('source', 'youtube_embed')
            .eq('content_type', 'music')
            .order('created_at', { ascending: false })
            .limit(12),
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
          supabase
            .from('songs')
            .select('*')
            .eq('content_type', 'podcast')
            .order('created_at', { ascending: false })
            .limit(12),
        ]);

      if (recentPlayedRes.data) {
        const songs = recentPlayedRes.data
          .map((r: Record<string, unknown>) => r.song as Song)
          .filter(Boolean);
        const unique = songs.filter(
          (s: Song, i: number, arr: Song[]) =>
            arr.findIndex((x: Song) => x.id === s.id) === i
        );
        setRecentSongs(unique.slice(0, 8));
      }
      if (recentAddedRes.data) setRecentlyAdded(recentAddedRes.data);
      if (ytRes.data) setYtTracks(ytRes.data);
      if (playlistsRes.data) setPlaylists(playlistsRes.data);
      if (albumsRes.data) setAlbums(albumsRes.data);
      if (podcastsRes.data) setPodcasts(podcastsRes.data);

      // Songs across ALL playlists, in playlist + position order
      const playlistsWithSongs = await fetchAllPlaylistsWithSongs();
      setAllPlaylistSongs(buildCrossPlaylistQueue(playlistsWithSongs));

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

  const dismissHint = () => {
    localStorage.setItem('echonest-bg-hint-dismissed', '1');
    setShowInstallHint(false);
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

      {/* PWA install hint for background play */}
      {showInstallHint && (
        <div className="bg-accent-muted border border-accent/30 rounded-xl p-3 sm:p-4 flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-medium text-foreground">Want music in the background?</p>
            <p className="text-muted-foreground text-xs mt-1">
              Install EchoNest as an app — uploaded songs play in the background and on your lock screen. (YouTube embeds need the screen on, by YouTube&apos;s policy.)
            </p>
          </div>
          <button onClick={dismissHint} className="text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

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

      {/* All songs from your playlists — clicking any plays through ALL playlists */}
      {allPlaylistSongs.length > 0 && (
        <Section title={`All Songs in Your Playlists (${allPlaylistSongs.length})`} icon={Disc} seeAllHref="/library">
          {allPlaylistSongs.map((song) => (
            <SongCard key={song.id} song={song} songs={allPlaylistSongs} />
          ))}
        </Section>
      )}

      {/* Recently Played */}
      {(loading || recentSongs.length > 0) && (
        <Section
          title="Recently Played"
          icon={Clock}
          seeAllHref="/recent"
          loading={loading}
          empty={recentSongs.length === 0}
        >
          {recentSongs.map((song) => (
            <SongCard key={song.id} song={song} songs={recentSongs} />
          ))}
        </Section>
      )}

      {/* Recently Added */}
      {(loading || recentlyAdded.length > 0) && (
        <Section
          title="Recently Added"
          icon={Music}
          seeAllHref="/library"
          loading={loading}
          empty={recentlyAdded.length === 0}
        >
          {recentlyAdded.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              songs={recentlyAdded}
              onDeleted={(id) => setRecentlyAdded((prev) => prev.filter((s) => s.id !== id))}
            />
          ))}
        </Section>
      )}

      {/* YouTube */}
      {ytTracks.length > 0 && (
        <Section title="From YouTube" icon={ExternalLink} seeAllHref="/import">
          {ytTracks.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              songs={ytTracks.filter((s) => s.youtube_kind !== 'playlist')}
              onDeleted={(id) => setYtTracks((prev) => prev.filter((s) => s.id !== id))}
            />
          ))}
        </Section>
      )}

      {/* Podcasts */}
      {podcasts.length > 0 && (
        <Section title="Podcasts" icon={Mic} seeAllHref="/library">
          {podcasts.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              songs={podcasts}
              onDeleted={(id) => setPodcasts((prev) => prev.filter((s) => s.id !== id))}
            />
          ))}
        </Section>
      )}

      {/* Playlists */}
      {playlists.length > 0 && (
        <Section title="Your Playlists" icon={ListMusic} seeAllHref="/library">
          {playlists.map((playlist) => (
            <MediaCard
              key={playlist.id}
              title={playlist.title}
              subtitle={playlist.description || 'Playlist'}
              imageUrl={playlist.cover_url}
              href={`/playlist/${playlist.id}`}
            />
          ))}
        </Section>
      )}

      {/* Albums */}
      {albums.length > 0 && (
        <Section title="Your Albums" icon={TrendingUp} seeAllHref="/library">
          {albums.map((album) => (
            <MediaCard
              key={album.id}
              title={album.title}
              subtitle={album.artist_name}
              imageUrl={album.cover_url}
              href={`/album/${album.id}`}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  seeAllHref,
  loading,
  empty,
  children,
}: {
  title: string;
  icon: React.ElementType;
  seeAllHref: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (empty && !loading) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-accent" />
          <h2 className="text-lg sm:text-xl font-semibold">{title}</h2>
        </div>
        <Link
          href={seeAllHref}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {children}
        </div>
      )}
    </section>
  );
}
