'use client';

import { useEffect, useState } from 'react';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, ListMusic, Check, Loader2, Music } from 'lucide-react';
import { Playlist } from '@/types';
import Image from 'next/image';

export function AddToPlaylistDialog() {
  const { isOpen, target, close } = usePlaylistDialog();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAdded(new Set());
      setShowCreate(false);
      setNewPlaylistName('');
      setError(null);
      loadPlaylists();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  async function loadPlaylists() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('playlists')
      .select('id, title, cover_url, description')
      .order('updated_at', { ascending: false });
    if (data) setPlaylists(data as Playlist[]);
    setLoading(false);
  }

  async function ensureSongId(): Promise<string | null> {
    if (!target) return null;
    if (target.songId && !target.songId.startsWith('yt-')) return target.songId;
    if (!target.youtubeVideo) return null;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const v = target.youtubeVideo;

    // Try to find an existing record first
    const { data: existing } = await supabase
      .from('songs')
      .select('id')
      .eq('user_id', user.id)
      .eq('source', 'youtube_embed')
      .eq('youtube_kind', 'video')
      .eq('youtube_id', v.videoId)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error: createError } = await supabase
      .from('songs')
      .insert({
        user_id: user.id,
        title: v.title,
        artist_name: v.author,
        cover_url: v.thumbnail,
        file_url: '',
        duration: 0,
        source: 'youtube_embed',
        youtube_id: v.videoId,
        youtube_kind: 'video',
      })
      .select('id')
      .single();

    if (createError) {
      setError(createError.message);
      return null;
    }
    return created?.id || null;
  }

  async function addToPlaylist(playlistId: string) {
    if (adding || !target) return;
    setError(null);
    setAdding(playlistId);

    const songId = await ensureSongId();
    if (!songId) {
      setAdding(null);
      if (!error) setError('Could not save the song');
      return;
    }

    const supabase = createClient();

    // Get current max position
    const { data: maxRow } = await supabase
      .from('playlist_songs')
      .select('position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPos = (maxRow?.position ?? -1) + 1;

    const { error: insertError } = await supabase
      .from('playlist_songs')
      .insert({
        playlist_id: playlistId,
        song_id: songId,
        position: nextPos,
      });

    if (insertError) {
      setError(insertError.message);
      setAdding(null);
      return;
    }

    // Touch the playlist's updated_at
    await supabase
      .from('playlists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', playlistId);

    setAdded((prev) => new Set(prev).add(playlistId));
    setAdding(null);
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlaylistName.trim() || creating) return;
    setCreating(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCreating(false);
      return;
    }

    const { data: playlist, error: createError } = await supabase
      .from('playlists')
      .insert({ user_id: user.id, title: newPlaylistName.trim() })
      .select('id, title, cover_url, description')
      .single();

    if (createError || !playlist) {
      setError(createError?.message || 'Failed to create playlist');
      setCreating(false);
      return;
    }

    setPlaylists((prev) => [playlist as Playlist, ...prev]);
    setNewPlaylistName('');
    setShowCreate(false);
    setCreating(false);

    // Auto-add the song to the new playlist
    await addToPlaylist(playlist.id);
  }

  if (!isOpen || !target) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={close}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      <div className="relative w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Add to playlist</h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {target.displayTitle}
            </p>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {/* Create new */}
        {showCreate ? (
          <form onSubmit={createAndAdd} className="px-4 py-3 border-b border-border flex gap-2">
            <input
              autoFocus
              type="text"
              placeholder="New playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newPlaylistName.trim() || creating}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewPlaylistName('');
              }}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-card-hover transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-md bg-accent-muted flex items-center justify-center flex-shrink-0">
              <Plus className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium">New playlist</p>
              <p className="text-xs text-muted-foreground">Create one for this song</p>
            </div>
          </button>
        )}

        {/* Existing playlists */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted" />
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8 px-4">
              You don&apos;t have any playlists yet. Create one above.
            </p>
          ) : (
            playlists.map((p) => {
              const wasAdded = added.has(p.id);
              const isAdding = adding === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => addToPlaylist(p.id)}
                  disabled={wasAdded || !!adding}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-card-hover transition-colors text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-md bg-background overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {p.cover_url ? (
                      <Image
                        src={p.cover_url}
                        alt={p.title}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ListMusic className="w-5 h-5 text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    {p.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {p.description}
                      </p>
                    )}
                  </div>
                  {wasAdded ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="w-4 h-4" /> Added
                    </span>
                  ) : isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted" />
                  ) : (
                    <Music className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-border">
          <button
            onClick={close}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
