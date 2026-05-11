'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Album, Artist, Playlist } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Music, Disc3, Mic2, ListMusic, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'songs' | 'albums' | 'artists' | 'playlists' | 'podcasts';

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('songs');
  const [songs, setSongs] = useState<Song[]>([]);
  const [podcastPlaylists, setPodcastPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

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
        // Show PODCAST playlists (one entry per imported podcast playlist),
        // not a flat list of every podcast episode
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .eq('content_type', 'podcast')
          .order('updated_at', { ascending: false });
        if (data) setPodcastPlaylists(data);
      } else if (tab === 'albums') {
        const { data } = await supabase
          .from('albums')
          .select('*')
          .order('title');
        if (data) setAlbums(data);
      } else if (tab === 'artists') {
        const { data } = await supabase
          .from('artists')
          .select('*')
          .order('name');
        if (data) setArtists(data);
      } else {
        // 'playlists' tab — show only music playlists (so podcasts stay
        // separate in their own tab)
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .eq('content_type', 'music')
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
              <div className="space-y-0.5">
                {songs.map((song, i) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={i}
                    showIndex
                    songs={songs}
                    onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
                  />
                ))}
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
