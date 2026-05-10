'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Playlist, Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePlayerStore } from '@/store/player';
import { Play, Shuffle, ListMusic, Music, ArrowLeft, MoreHorizontal, Trash2 } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import Image from 'next/image';

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    if (id === 'new') return;

    const supabase = createClient();
    async function load() {
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
      setLoading(false);
    }

    load();
  }, [id]);

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

            <div className="flex items-center gap-3 mt-4">
              <Button
                onClick={() => songs.length > 0 && play(songs[0], songs, 'playlist')}
                disabled={songs.length === 0}
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (songs.length > 0) {
                    const shuffled = [...songs].sort(() => Math.random() - 0.5);
                    play(shuffled[0], shuffled, 'playlist');
                  }
                }}
                disabled={songs.length === 0}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              <Menu
                trigger={
                  <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                }
                items={[
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
            </div>
          </div>
        </div>
      </div>

      {/* Songs */}
      <div className="p-6 lg:p-8 pt-4">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        ) : songs.length > 0 ? (
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongRow key={song.id} song={song} index={i} showIndex songs={songs} source="playlist" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Music}
            title="Playlist is empty"
            description="Add songs from your library to this playlist"
          />
        )}
      </div>
    </div>
  );
}

function NewPlaylistPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('playlists')
      .insert({ title, description: description || null })
      .select('id')
      .single();

    if (data && !error) {
      router.push(`/playlist/${data.id}`);
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
        <Button type="submit" disabled={creating || !title.trim()}>
          {creating ? 'Creating...' : 'Create playlist'}
        </Button>
      </form>
    </div>
  );
}
