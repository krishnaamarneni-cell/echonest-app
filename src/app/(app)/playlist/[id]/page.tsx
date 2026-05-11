'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Playlist, Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePlayerStore } from '@/store/player';
import { Play, Shuffle, ListMusic, Music, ArrowLeft, MoreHorizontal, Trash2, RefreshCw, CheckCircle2, Pencil, LayoutGrid, List } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { EditPlaylistDialog } from '@/components/ui/EditPlaylistDialog';
import Image from 'next/image';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue } from '@/lib/playlistQueue';
import { useOwnerMode } from '@/store/ownerMode';
import { syncYouTubePlaylist } from '@/lib/syncYouTubePlaylist';

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [crossQueue, setCrossQueue] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const play = usePlayerStore((s) => s.play);
  const isOwner = useOwnerMode((s) => s.isOwner);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('echonest-playlist-view') : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('echonest-playlist-view', v);
  };

  const reload = useCallback(async () => {
    if (id === 'new') return;
    const supabase = createClient();
    const { data: pl } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', id)
      .single();
    if (pl) setPlaylist(pl);

    const { data: ps } = await supabase
      .from('playlist_songs')
      .select('*, song:songs(*)')
      .eq('playlist_id', id)
      .order('position');
    if (ps) {
      setSongs(ps.map((p: Record<string, unknown>) => p.song as Song).filter(Boolean));
    }

    const playlistsWithSongs = await fetchAllPlaylistsWithSongs();
    setCrossQueue(buildCrossPlaylistQueue(playlistsWithSongs, id as string));
  }, [id]);

  // Initial load
  useEffect(() => {
    if (id === 'new') return;
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, [id, reload]);

  // Auto-sync on visit: if this playlist was imported from YouTube AND we
  // haven't synced in the last 5 minutes, silently fetch new videos
  useEffect(() => {
    if (!playlist?.source_youtube_id) return;
    const recently =
      playlist.last_synced_at &&
      Date.now() - new Date(playlist.last_synced_at).getTime() < 5 * 60 * 1000;
    if (recently) return;
    if (syncing) return;

    let cancelled = false;
    (async () => {
      const result = await syncYouTubePlaylist({
        playlistDbId: playlist.id,
        sourceYoutubeId: playlist.source_youtube_id!,
      });
      if (cancelled) return;
      if (result.added > 0 || result.removed > 0) {
        const parts: string[] = [];
        if (result.added > 0) parts.push(`+${result.added}`);
        if (result.removed > 0) parts.push(`-${result.removed}`);
        setSyncMessage(`Synced: ${parts.join(' / ')}`);
        reload();
        // Auto-clear after 4 seconds
        setTimeout(() => setSyncMessage(null), 4000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlist?.id, playlist?.source_youtube_id, playlist?.last_synced_at, syncing, reload]);

  const handleManualSync = async () => {
    if (!playlist?.source_youtube_id || syncing) return;
    setSyncing(true);
    setSyncMessage('Checking YouTube…');
    const result = await syncYouTubePlaylist({
      playlistDbId: playlist.id,
      sourceYoutubeId: playlist.source_youtube_id,
    });
    if (result.error) {
      setSyncMessage(`Sync failed: ${result.error}`);
    } else if (result.added > 0 || result.removed > 0) {
      const parts: string[] = [];
      if (result.added > 0) parts.push(`Added ${result.added}`);
      if (result.removed > 0) parts.push(`Removed ${result.removed}`);
      setSyncMessage(parts.join(' • '));
      await reload();
    } else {
      setSyncMessage('Already up to date');
    }
    setSyncing(false);
    setTimeout(() => setSyncMessage(null), 4000);
  };

  if (id === 'new') {
    return <NewPlaylistPage />;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-accent/20 to-background p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          className="lg:hidden mb-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-48 h-48 rounded-xl bg-card overflow-hidden flex-shrink-0 shadow-2xl">
            {playlist?.cover_url ? (
              <Image
                src={playlist.cover_url}
                alt={playlist.title}
                width={192}
                height={192}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-purple-600/30">
                <ListMusic className="w-16 h-16 text-accent" />
              </div>
            )}
          </div>
          <div className="flex-1 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Playlist
            </p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">
              {playlist?.title || 'Loading...'}
            </h1>
            {playlist?.description && (
              <p className="text-muted-foreground mt-2">{playlist.description}</p>
            )}
            <p className="text-sm text-muted mt-3">{songs.length} songs</p>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4">
              <Button
                onClick={() => {
                  if (songs.length === 0) return;
                  const queue = crossQueue.length > 0 ? crossQueue : songs;
                  play(queue[0], queue, 'playlist');
                }}
                disabled={songs.length === 0}
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (songs.length === 0) return;
                  // Shuffle just this playlist; queue continues into other playlists in normal order
                  const shuffledHere = [...songs].sort(() => Math.random() - 0.5);
                  const tail = crossQueue.length > songs.length
                    ? crossQueue.slice(songs.length)
                    : [];
                  const queue = [...shuffledHere, ...tail];
                  play(queue[0], queue, 'playlist');
                }}
                disabled={songs.length === 0}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              {playlist?.source_youtube_id && (
                <Button
                  variant="secondary"
                  onClick={handleManualSync}
                  disabled={syncing}
                  title="Check YouTube for new videos and add them"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync from YouTube'}
                </Button>
              )}
              {isOwner && (
                <Menu
                  trigger={
                    <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  }
                  items={[
                    {
                      label: 'Edit playlist',
                      icon: Pencil,
                      onClick: () => setEditOpen(true),
                    },
                    {
                      label: 'Delete playlist',
                      icon: Trash2,
                      variant: 'danger',
                      onClick: async () => {
                        if (!confirm(`Delete playlist "${playlist?.title}"? This cannot be undone.`)) return;
                        const supabase = createClient();
                        const { error } = await supabase.from('playlists').delete().eq('id', id);
                        if (error) {
                          alert('Failed to delete: ' + error.message);
                          return;
                        }
                        router.push('/library');
                        router.refresh();
                      },
                    },
                  ]}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sync message banner */}
      {syncMessage && (
        <div className="px-6 lg:px-8 pt-2">
          <div className="bg-accent-muted text-accent text-sm px-4 py-2 rounded-lg flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            {syncMessage}
          </div>
        </div>
      )}

      {/* Songs */}
      <div className="p-6 lg:p-8 pt-4 space-y-4">
        {/* View toggle */}
        {!loading && songs.length > 0 && (
          <div className="flex items-center justify-end gap-1">
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

        {loading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <SongRowSkeleton key={i} />
              ))}
            </div>
          )
        ) : songs.length > 0 ? (
          view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {songs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  songs={crossQueue.length > 0 ? crossQueue : songs}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {songs.map((song, i) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={i}
                  showIndex
                  songs={crossQueue.length > 0 ? crossQueue : songs}
                  source="playlist"
                />
              ))}
            </div>
          )
        ) : (
          <EmptyState
            icon={Music}
            title="Playlist is empty"
            description="Add songs from your library to this playlist"
          />
        )}
      </div>

      <EditPlaylistDialog
        playlist={playlist}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setPlaylist(updated);
        }}
      />
    </div>
  );
}

function NewPlaylistPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setError('');
    setCreating(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in');
      setCreating(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        description: description.trim() || null,
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }

    if (data) {
      router.push(`/playlist/${data.id}`);
      router.refresh();
    }
    setCreating(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-6 animate-fade-in">
      <div>
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-bold">New Playlist</h1>
      </div>
      <form onSubmit={handleCreate} className="space-y-4">
        <Input
          label="Playlist name"
          placeholder="My Awesome Playlist"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Input
          label="Description (optional)"
          placeholder="What's this playlist about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        <Button type="submit" disabled={creating || !title.trim()}>
          {creating ? 'Creating...' : 'Create playlist'}
        </Button>
      </form>
    </div>
  );
}
