'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Album, Artist, Playlist } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Music, Disc3, Mic2, ListMusic, Mic, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

const SONGS_PER_PAGE = 8;

type Tab = 'songs' | 'albums' | 'artists' | 'playlists' | 'podcasts';

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('songs');
  const [songs, setSongs] = useState<Song[]>([]);
  const [podcastPlaylists, setPodcastPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [songsPage, setSongsPage] = useState(0);
  const [songsView, setSongsView] = useState<'grid' | 'list'>('grid');

  // Reset to page 1 when tab changes
  useEffect(() => {
    setSongsPage(0);
  }, [tab]);

  const songsTotalPages = Math.max(1, Math.ceil(songs.length / SONGS_PER_PAGE));
  const pagedSongs = useMemo(
    () => songs.slice(songsPage * SONGS_PER_PAGE, (songsPage + 1) * SONGS_PER_PAGE),
    [songs, songsPage],
  );

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);

    async function load() {
      if (tab === 'songs') {
        const { data } = await supabase
          .from('songs')
          .select('*')
          .eq('content_type', 'music')
          .order('created_at', { ascending: false });
        if (data) setSongs(data);
      } else if (tab === 'podcasts') {
        // Show PODCAST playlists — both content_type='podcast' AND any
        // playlist that contains podcast songs (handles legacy data added
        // before content_type was set during import).
        const [tagged, withPodcastSongs] = await Promise.all([
          supabase
            .from('playlists')
            .select('*')
            .eq('content_type', 'podcast'),
          supabase
            .from('playlist_songs')
            .select('playlist_id, song:songs!inner(content_type)')
            .eq('song.content_type', 'podcast'),
        ]);

        const taggedIds = new Set<string>(
          (tagged.data || []).map((p) => p.id as string),
        );
        const songPlaylistIds = new Set<string>(
          (withPodcastSongs.data || []).map(
            (r: { playlist_id: string }) => r.playlist_id,
          ),
        );

        // Fetch any additional playlists referenced by songs but not yet tagged
        const extraIds = [...songPlaylistIds].filter((id) => !taggedIds.has(id));
        let extras: Playlist[] = [];
        if (extraIds.length > 0) {
          const { data: extraData } = await supabase
            .from('playlists')
            .select('*')
            .in('id', extraIds);
          if (extraData) extras = extraData as Playlist[];
        }

        const merged = [...(tagged.data || []), ...extras].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        setPodcastPlaylists(merged);
      } else if (tab === 'albums') {
        const { data } = await supabase
          .from('albums')
          .select('*')
          .order('title');
        if (data) setAlbums(data);
      } else if (tab === 'artists') {
        // Only show artists that actually have at least one song. Count
        // songs per artist_id and filter the artist list accordingly.
        const [{ data: artistRows }, { data: songRows }] = await Promise.all([
          supabase.from('artists').select('*').order('name'),
          supabase.from('songs').select('artist_id').not('artist_id', 'is', null),
        ]);

        const counts = new Map<string, number>();
        for (const s of songRows || []) {
          const id = (s as { artist_id: string | null }).artist_id;
          if (id) counts.set(id, (counts.get(id) || 0) + 1);
        }

        const withSongs = (artistRows || [])
          .filter((a) => counts.has(a.id as string))
          .map((a) => ({ ...a, song_count: counts.get(a.id as string) || 0 }));
        setArtists(withSongs as Artist[]);
      } else {
        // 'playlists' tab — show music + untagged playlists only.
        // Artist/album/podcast playlists belong in their dedicated tabs.
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .or('content_type.eq.music,content_type.is.null')
          .order('updated_at', { ascending: false });
        if (data) setPlaylists(data);
      }
      setLoading(false);
    }

    load();
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'songs', label: 'Songs', icon: Music },
    { id: 'podcasts', label: 'Podcasts', icon: Mic },
    { id: 'albums', label: 'Albums', icon: Disc3 },
    { id: 'artists', label: 'Artists', icon: Mic2 },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">Your Library</h1>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              tab === t.id
                ? 'bg-accent text-white'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-card-hover'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        tab === 'songs' ? (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )
      ) : (
        <>
          {tab === 'songs' && (
            songs.length > 0 ? (
              <div className="space-y-4">
                {/* Header: total + view toggle */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">
                    Showing{' '}
                    <span className="text-foreground font-medium">
                      {songsPage * SONGS_PER_PAGE + 1}–
                      {Math.min((songsPage + 1) * SONGS_PER_PAGE, songs.length)}
                    </span>{' '}
                    of <span className="text-foreground font-medium">{songs.length}</span> songs
                  </p>
                  <div className="flex gap-1 bg-card border border-border rounded-full p-1">
                    <button
                      onClick={() => setSongsView('grid')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        songsView === 'grid'
                          ? 'bg-accent text-white'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <LayoutGrid className="w-3 h-3" />
                      Grid
                    </button>
                    <button
                      onClick={() => setSongsView('list')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        songsView === 'list'
                          ? 'bg-accent text-white'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <List className="w-3 h-3" />
                      List
                    </button>
                  </div>
                </div>

                {/* Grid view — big covers, 8 per page */}
                {songsView === 'grid' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {pagedSongs.map((song) => (
                      <SongCard
                        key={song.id}
                        song={song}
                        songs={songs}
                        onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
                      />
                    ))}
                  </div>
                )}

                {/* List view — compact rows (older behavior) */}
                {songsView === 'list' && (
                  <div className="space-y-0.5">
                    {pagedSongs.map((song, i) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        index={songsPage * SONGS_PER_PAGE + i}
                        showIndex
                        songs={songs}
                        onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
                      />
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {songsTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      onClick={() => setSongsPage((p) => Math.max(0, p - 1))}
                      disabled={songsPage === 0}
                      className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-card-hover transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-muted-foreground tabular-nums px-2">
                      Page {songsPage + 1} of {songsTotalPages}
                    </span>
                    <button
                      onClick={() =>
                        setSongsPage((p) => Math.min(songsTotalPages - 1, p + 1))
                      }
                      disabled={songsPage >= songsTotalPages - 1}
                      className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-card-hover transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={Music} title="No songs yet" description="Upload your music to get started" />
            )
          )}

          {tab === 'podcasts' && (
            podcastPlaylists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {podcastPlaylists.map((playlist) => (
                  <MediaCard
                    key={playlist.id}
                    title={playlist.title}
                    subtitle={playlist.description || 'Podcast'}
                    imageUrl={playlist.cover_url}
                    href={`/playlist/${playlist.id}`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Mic}
                title="No podcast playlists yet"
                description="When you paste a YouTube playlist URL, select Podcast — it'll show up here as a playlist with all episodes inside"
              />
            )
          )}

          {tab === 'albums' && (
            albums.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
            ) : (
              <EmptyState icon={Disc3} title="No albums" description="Albums appear when you upload music with album info" />
            )
          )}

          {tab === 'artists' && (
            artists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
              </div>
            ) : (
              <EmptyState icon={Mic2} title="No artists" description="Artists appear when you upload music" />
            )
          )}

          {tab === 'playlists' && (
            playlists.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
            ) : (
              <EmptyState icon={ListMusic} title="No playlists" description="Create your first playlist" />
            )
          )}
        </>
      )}
    </div>
  );
}
