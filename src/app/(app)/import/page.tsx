'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SongRow } from '@/components/ui/SongRow';
import { Song } from '@/types';
import { Link2, CheckCircle, AlertCircle, Plus, ListMusic, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from '@/components/ui/Menu';
import { useOwnerMode } from '@/store/ownerMode';

export default function ImportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [embedded, setEmbedded] = useState<Song[]>([]);
  const isOwner = useOwnerMode((s) => s.isOwner);

  const loadEmbedded = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('songs')
      .select('*')
      .eq('source', 'youtube_embed')
      .order('created_at', { ascending: false });
    if (data) setEmbedded(data);
  };

  useEffect(() => {
    loadEmbedded();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/youtube-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to add video' });
      } else {
        setMessage({ type: 'success', text: `Added "${data.song.title}"` });
        setUrl('');
        loadEmbedded();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    }

    setLoading(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Add from YouTube</h1>
        <p className="text-muted-foreground mt-1">
          Paste a video or playlist URL — it streams inside EchoNest via the official embed
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <Link2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Streams via YouTube&apos;s official embed player — no downloads, no API key.</p>
          <p>Single video URLs add one track. Playlist URLs add the whole playlist as one entry that plays through every video in order.</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-3">
        <Input
          placeholder="youtube.com/watch?v=... or youtube.com/playlist?list=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
          required
        />
        <Button type="submit" disabled={loading || !url.trim()}>
          <Plus className="w-4 h-4" />
          {loading ? 'Adding...' : 'Add'}
        </Button>
      </form>

      {message && (
        <div
          className={`px-4 py-3 rounded-xl text-sm flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5" />
          )}
          {message.text}
        </div>
      )}

      {embedded.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your YouTube Tracks</h2>
          <div className="space-y-0.5">
            {embedded.map((song) =>
              song.youtube_kind === 'playlist' ? (
                <div
                  key={song.id}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-card-hover transition-colors"
                >
                  <Link
                    href={`/yt-playlist/${song.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
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
                  {isOwner && (
                    <Menu
                      trigger={
                        <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        {
                          label: 'Delete',
                          icon: Trash2,
                          variant: 'danger',
                          onClick: async () => {
                            if (!confirm(`Delete "${song.title}"?`)) return;
                            const supabase = createClient();
                            const { error } = await supabase.from('songs').delete().eq('id', song.id);
                            if (error) {
                              alert('Failed to delete: ' + error.message);
                              return;
                            }
                            loadEmbedded();
                          },
                        },
                      ]}
                    />
                  )}
                </div>
              ) : (
                <SongRow
                  key={song.id}
                  song={song}
                  songs={embedded.filter((s) => s.youtube_kind !== 'playlist')}
                  onDeleted={() => loadEmbedded()}
                />
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
