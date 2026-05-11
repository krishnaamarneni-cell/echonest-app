'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Playlist } from '@/types';
import { X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

interface EditPlaylistDialogProps {
  playlist: Playlist | null;
  open: boolean;
  onClose: () => void;
  onSaved: (playlist: Playlist) => void;
}

export function EditPlaylistDialog({
  playlist,
  open,
  onClose,
  onSaved,
}: EditPlaylistDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && playlist) {
      setTitle(playlist.title || '');
      setDescription(playlist.description || '');
      setCoverUrl(playlist.cover_url || '');
      setError('');
    }
  }, [open, playlist]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !playlist) return null;

  const useFirstSongCover = async () => {
    setError('');
    const supabase = createClient();
    const { data } = await supabase
      .from('playlist_songs')
      .select('song:songs(cover_url)')
      .eq('playlist_id', playlist.id)
      .order('position')
      .limit(1)
      .maybeSingle();

    const row = data as unknown as { song: { cover_url?: string } | { cover_url?: string }[] | null } | null;
    const song = row && (Array.isArray(row.song) ? row.song[0] : row.song);
    if (song?.cover_url) {
      setCoverUrl(song.cover_url);
    } else {
      setError('No songs in this playlist have a cover yet');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }
    setError('');
    setSaving(true);

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from('playlists')
      .update({
        title: trimmedTitle,
        description: description.trim() || null,
        cover_url: coverUrl.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playlist.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    if (data) onSaved(data as Playlist);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold">Edit playlist</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          {/* Cover preview */}
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl bg-background overflow-hidden flex-shrink-0 flex items-center justify-center">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <button
                type="button"
                onClick={useFirstSongCover}
                className="text-xs text-accent hover:underline"
              >
                Use first song's cover
              </button>
              <p className="text-xs text-muted-foreground">
                Paste any image URL below, or use the first song's thumbnail.
              </p>
            </div>
          </div>

          <Input
            label="Cover image URL"
            placeholder="https://..."
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />

          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <Input
            label="Description"
            placeholder="What's this playlist about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

