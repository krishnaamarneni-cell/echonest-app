'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Playlist, Album, Artist } from '@/types';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongCard } from '@/components/ui/SongCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Clock, TrendingUp, ListMusic, Music, ExternalLink, Smartphone, Disc, Mic, Mic2 } from 'lucide-react';
import Link from 'next/link';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue } from '@/lib/playlistQueue';

type HomeTab = 'all' | 'songs' | 'podcasts' | 'albums' | 'artists' | 'playlists';

export default function DashboardPage() {
  const [tab, setTab] = useState<HomeTab>('all');
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Song[]>([]);
  const [ytTracks, setYtTracks] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [allPlaylistSongs, setAllPlaylistSongs] = useState<Song[]>([]);
  const [podcasts, setPodcasts] = useState<Song[]>([]);
  const [podcastPlaylists, setPodcastPlaylists] = useState<Playlist[]>([]);
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
      const [
        recentPlayedRes,
        recentAddedRes,
        ytRes,
        playlistsRes,
        albumsRes,
        podcastPlaylistsRes,
        podcastSongsRes,
      ] = await Promise.all([
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
          .limit(100),
        supabase
          .from('songs')
          .select('*')
          .eq('source', 'youtube_embed')
          .eq('content_type', 'music')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('playlists')
          .select('*')
          .or('content_type.eq.music,content_type.is.null')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('albums')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('playlists')
          .select('*')
          .eq('content_type', 'podcast')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('songs')
          .select('*')
          .eq('content_type', 'podcast')
          .order('created_at', { ascending: false })
          .limit(100),
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
      if (podcastPlaylistsRes.data) setPodcastPlaylists(podcastPlaylistsRes.data);
      if (podcastSongsRes.data) setPodcasts(podcastSongsRes.data);

      // Artists with 2+ linked songs, sorted by song count, with fallback
      // cover image pulled from one of the artist's songs.
      const [{ data: artistRows }, { data: songArtistRows }] = await Promise.all([
        supabase.from('artists').select('*'),
        supabase
          .from('songs')
          .select('artist_id, cover_url')
          .not('artist_id', 'is', null)
          .not('cover_url', 'is', null),
      ]);
      const counts = new Map<string, number>();
      const covers = new Map<string, string>();
      for (const s of songArtistRows || []) {
        const row = s as { artist_id: string | null; cover_url: string | null };
        if (!row.artist_id) continue;
        counts.set(row.artist_id, (counts.get(row.artist_id) || 0) + 1);
        if (row.cover_url && !covers.has(row.artist_id)) {
          covers.set(row.artist_id, row.cover_url);
        }
      }
      const artistsWithSongs = (artistRows || [])
        .map((a) => ({
          ...a,
          song_count: counts.get(a.id as string) || 0,
          image_url: (a.image_url as string | null) || covers.get(a.id as string) || null,
        }))
        .filter((a) => a.song_count >= 2)
        .sort((a, b) => b.song_count - a.song_count);
      setArtists(artistsWithSongs as Artist[]);

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

  // Combined music songs (uploaded + YouTube embed) for the Songs tab
  const allMusicSongs = [...recentlyAdded, ...ytTracks].filter(
    (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i,
  );

  // Tab order mirrors Library, with 'All' prepended
  const homeTabs: { id: HomeTab; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All', icon: TrendingUp },
    { id: 'songs', label: 'Songs', icon: Music },
    { id: 'podcasts', label: 'Podcasts', icon: Mic },
    { id: 'albums', label: 'Albums', icon: Disc },
    { id: 'artists', label: 'Artists', icon: Mic2 },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{greeting()}</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Here&apos;s what&apos;s playing in your world
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {homeTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-accent text-white'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-card-hover'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
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

      {/* === ALL tab: previews of everything (5-10 per type) === */}
      {tab === 'all' && (
        <>
          {/* All songs from your playlists — preview only */}
          {allPlaylistSongs.length > 0 && (
            <Section
              title={`All Songs in Your Playlists (${allPlaylistSongs.length})`}
              icon={Disc}
              seeAllHref="/library"
            >
              {allPlaylistSongs.slice(0, 10).map((song) => (
                <SongCard key={song.id} song={song} songs={allPlaylistSongs} />
              ))}
            </Section>
          )}

          {(loading || recentSongs.length > 0) && (
            <Section
              title="Recently Played"
              icon={Clock}
              seeAllHref="/recent"
              loading={loading}
              empty={recentSongs.length === 0}
            >
              {recentSongs.slice(0, 8).map((song) => (
                <SongCard key={song.id} song={song} songs={recentSongs} />
              ))}
            </Section>
          )}

          {(loading || recentlyAdded.length > 0) && (
            <Section
              title="Recently Added"
              icon={Music}
              seeAllHref="/library"
              loading={loading}
              empty={recentlyAdded.length === 0}
            >
              {recentlyAdded.slice(0, 10).map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  songs={recentlyAdded}
                  onDeleted={(id) => setRecentlyAdded((prev) => prev.filter((s) => s.id !== id))}
                />
              ))}
            </Section>
          )}

          {ytTracks.length > 0 && (
            <Section title="From YouTube" icon={ExternalLink} seeAllHref="/import">
              {ytTracks.slice(0, 10).map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  songs={ytTracks.filter((s) => s.youtube_kind !== 'playlist')}
                  onDeleted={(id) => setYtTracks((prev) => prev.filter((s) => s.id !== id))}
                />
              ))}
            </Section>
          )}

          {podcastPlaylists.length > 0 && (
            <Section title="Podcast Playlists" icon={Mic} seeAllHref="/library">
              {podcastPlaylists.slice(0, 10).map((playlist) => (
                <MediaCard
                  key={playlist.id}
                  title={playlist.title}
                  subtitle="Podcast"
                  imageUrl={playlist.cover_url}
                  href={`/playlist/${playlist.id}`}
                />
              ))}
            </Section>
          )}

          {playlists.length > 0 && (
            <Section title="Your Playlists" icon={ListMusic} seeAllHref="/library">
              {playlists.slice(0, 10).map((playlist) => (
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

          {albums.length > 0 && (
            <Section title="Your Albums" icon={TrendingUp} seeAllHref="/library">
              {albums.slice(0, 10).map((album) => (
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

          {artists.length > 0 && (
            <Section title="Artists" icon={Mic2} seeAllHref="/library">
              {artists.slice(0, 10).map((artist) => (
                <MediaCard
                  key={artist.id}
                  title={artist.name}
                  subtitle={`${artist.song_count || 0} songs`}
                  imageUrl={artist.image_url}
                  href={`/artist/${artist.id}`}
                  rounded
                />
              ))}
            </Section>
          )}
        </>
      )}

      {/* === SONGS tab: every music song === */}
      {tab === 'songs' && (
        allMusicSongs.length > 0 ? (
          <Section title={`All Songs (${allMusicSongs.length})`} icon={Music} seeAllHref="/library">
            {allMusicSongs.map((song) => (
              <SongCard key={song.id} song={song} songs={allMusicSongs} />
            ))}
          </Section>
        ) : (
          <p className="text-center text-muted-foreground py-12">
            No songs yet. Add some on the Upload page.
          </p>
        )
      )}

      {/* === PODCASTS tab: podcast playlists + standalone episodes === */}
      {tab === 'podcasts' && (
        <>
          {podcastPlaylists.length > 0 && (
            <Section title="Podcast Playlists" icon={Mic} seeAllHref="/library">
              {podcastPlaylists.map((playlist) => (
                <MediaCard
                  key={playlist.id}
                  title={playlist.title}
                  subtitle="Podcast"
                  imageUrl={playlist.cover_url}
                  href={`/playlist/${playlist.id}`}
                />
              ))}
            </Section>
          )}
          {podcasts.length > 0 && (
            <Section title="Podcast Episodes" icon={Mic} seeAllHref="/library">
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
          {podcastPlaylists.length === 0 && podcasts.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              No podcasts yet. Add a podcast playlist URL from the Upload page (pick 🎙️ Podcast).
            </p>
          )}
        </>
      )}

      {/* === PLAYLISTS tab: every music playlist === */}
      {tab === 'playlists' && (
        playlists.length > 0 ? (
          <Section title={`Your Playlists (${playlists.length})`} icon={ListMusic} seeAllHref="/library">
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
        ) : (
          <p className="text-center text-muted-foreground py-12">
            No playlists yet. Create one or import a YouTube playlist.
          </p>
        )
      )}

      {/* === ALBUMS tab: every album === */}
      {tab === 'albums' && (
        albums.length > 0 ? (
          <Section title={`Your Albums (${albums.length})`} icon={Disc} seeAllHref="/library">
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
        ) : (
          <p className="text-center text-muted-foreground py-12">No albums yet.</p>
        )
      )}

      {/* === ARTISTS tab: every artist with at least one song === */}
      {tab === 'artists' && (
        artists.length > 0 ? (
          <Section title={`Artists (${artists.length})`} icon={Mic2} seeAllHref="/library">
            {artists.map((artist) => (
              <MediaCard
                key={artist.id}
                title={artist.name}
                subtitle={`${artist.song_count || 0} songs`}
                imageUrl={artist.image_url}
                href={`/artist/${artist.id}`}
                rounded
              />
            ))}
          </Section>
        ) : (
          <p className="text-center text-muted-foreground py-12">No artists yet.</p>
        )
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
