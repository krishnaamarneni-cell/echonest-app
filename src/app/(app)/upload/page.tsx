'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Upload, Music, CheckCircle, AlertCircle, X, Link2, Plus, Loader2 } from 'lucide-react';
import {
  parseYouTubeUrl,
  extractYouTubePlaylist,
} from '@/lib/extractYouTubePlaylist';

interface UploadFile {
  file: File;
  title: string;
  artistName: string;
  albumName: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  progress: number;
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // YouTube link state
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytStatus, setYtStatus] = useState<string>('');
  const [ytMessage, setYtMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleYouTubeAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim() || ytLoading) return;
    setYtMessage(null);
    setYtStatus('');
    setYtLoading(true);

    try {
      const parsed = parseYouTubeUrl(ytUrl);
      if (!parsed) {
        setYtMessage({
          type: 'error',
          text: 'Could not parse YouTube URL. Paste a video URL or playlist URL.',
        });
        setYtLoading(false);
        return;
      }

      if (parsed.kind === 'playlist') {
        // Extract every video in the playlist and save each as an individual song
        setYtStatus('Loading playlist…');
        let videos;
        try {
          videos = await extractYouTubePlaylist(parsed.id);
        } catch (err) {
          setYtMessage({
            type: 'error',
            text: err instanceof Error ? err.message : 'Could not load playlist',
          });
          setYtLoading(false);
          setYtStatus('');
          return;
        }

        setYtStatus(`Found ${videos.length} videos. Saving…`);

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setYtMessage({ type: 'error', text: 'Not signed in' });
          setYtLoading(false);
          setYtStatus('');
          return;
        }

        // Skip videos already saved as individual songs in this user's library
        const videoIds = videos.map((v) => v.videoId);
        const { data: existing } = await supabase
          .from('songs')
          .select('youtube_id')
          .eq('user_id', user.id)
          .eq('source', 'youtube_embed')
          .eq('youtube_kind', 'video')
          .in('youtube_id', videoIds);

        const existingSet = new Set(
          (existing || []).map((s) => s.youtube_id as string),
        );
        const newSongs = videos
          .filter((v) => !existingSet.has(v.videoId))
          .map((v) => ({
            user_id: user.id,
            title: v.title,
            artist_name: v.author,
            cover_url: v.thumbnail,
            file_url: '',
            duration: 0,
            source: 'youtube_embed',
            youtube_id: v.videoId,
            youtube_kind: 'video',
          }));

        if (newSongs.length === 0) {
          setYtMessage({
            type: 'success',
            text: `All ${videos.length} videos were already in your library`,
          });
          setYtUrl('');
          setYtLoading(false);
          setYtStatus('');
          return;
        }

        // Insert in batches of 100 to be safe
        const batchSize = 100;
        let inserted = 0;
        for (let i = 0; i < newSongs.length; i += batchSize) {
          const batch = newSongs.slice(i, i + batchSize);
          const { error } = await supabase.from('songs').insert(batch);
          if (error) {
            setYtMessage({
              type: 'error',
              text: `Saved ${inserted}/${newSongs.length} songs, then failed: ${error.message}`,
            });
            setYtLoading(false);
            setYtStatus('');
            return;
          }
          inserted += batch.length;
          setYtStatus(`Saving songs… ${inserted}/${newSongs.length}`);
        }

        const skippedCount = videos.length - newSongs.length;
        setYtMessage({
          type: 'success',
          text:
            skippedCount > 0
              ? `Added ${newSongs.length} new songs (${skippedCount} were already in your library)`
              : `Added ${newSongs.length} songs from the playlist`,
        });
        setYtUrl('');
      } else {
        // Single video — keep using the existing API endpoint
        const res = await fetch('/api/youtube-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: ytUrl }),
        });
        const data = await res.json();

        if (!res.ok) {
          setYtMessage({ type: 'error', text: data.error || 'Failed to add' });
        } else {
          setYtMessage({ type: 'success', text: `Added "${data.song.title}"` });
          setYtUrl('');
        }
      }
    } catch {
      setYtMessage({ type: 'error', text: 'Network error. Please try again.' });
    }

    setYtLoading(false);
    setYtStatus('');
  };

  const handleFiles = (fileList: FileList) => {
    const audioFiles = Array.from(fileList).filter((f) =>
      f.type.startsWith('audio/')
    );

    const newFiles: UploadFile[] = audioFiles.map((file) => {
      const name = file.name.replace(/\.[^.]+$/, '');
      const parts = name.split(' - ');
      return {
        file,
        title: parts.length > 1 ? parts[1].trim() : name,
        artistName: parts.length > 1 ? parts[0].trim() : 'Unknown Artist',
        albumName: '',
        status: 'pending',
        progress: 0,
      };
    });

    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFile = (index: number, updates: Partial<UploadFile>) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const uploadAll = async () => {
    setUploading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.status === 'done') continue;

      updateFile(i, { status: 'uploading', progress: 30 });

      const ext = f.file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(path, f.file, { contentType: f.file.type });

      if (uploadError) {
        updateFile(i, { status: 'error', error: uploadError.message });
        continue;
      }

      updateFile(i, { progress: 70 });

      const {
        data: { publicUrl },
      } = supabase.storage.from('audio').getPublicUrl(path);

      let artistId: string | null = null;
      let albumId: string | null = null;

      if (f.artistName && f.artistName !== 'Unknown Artist') {
        const { data: existingArtist } = await supabase
          .from('artists')
          .select('id')
          .eq('name', f.artistName)
          .eq('user_id', user.id)
          .single();

        if (existingArtist) {
          artistId = existingArtist.id;
        } else {
          const { data: newArtist } = await supabase
            .from('artists')
            .insert({ name: f.artistName, user_id: user.id })
            .select('id')
            .single();
          if (newArtist) artistId = newArtist.id;
        }
      }

      if (f.albumName) {
        const { data: existingAlbum } = await supabase
          .from('albums')
          .select('id')
          .eq('title', f.albumName)
          .eq('user_id', user.id)
          .single();

        if (existingAlbum) {
          albumId = existingAlbum.id;
        } else {
          const { data: newAlbum } = await supabase
            .from('albums')
            .insert({
              title: f.albumName,
              artist_name: f.artistName,
              artist_id: artistId,
              user_id: user.id,
            })
            .select('id')
            .single();
          if (newAlbum) albumId = newAlbum.id;
        }
      }

      const duration = await getAudioDuration(f.file);

      const { error: insertError } = await supabase.from('songs').insert({
        title: f.title,
        artist_name: f.artistName,
        album_name: f.albumName || null,
        album_id: albumId,
        artist_id: artistId,
        file_url: publicUrl,
        duration,
        user_id: user.id,
      });

      if (insertError) {
        updateFile(i, { status: 'error', error: insertError.message });
      } else {
        updateFile(i, { status: 'done', progress: 100 });
      }
    }

    setUploading(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Add Music</h1>
        <p className="text-muted-foreground mt-1">
          Upload your own files or paste a YouTube link
        </p>
      </div>

      {/* YouTube link section */}
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Add from YouTube</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste a video or playlist URL — streams via the official embed,
              no download.
            </p>
          </div>
        </div>

        <form onSubmit={handleYouTubeAdd} className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="youtube.com/watch?v=... or youtube.com/playlist?list=..."
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            className="flex-1"
            disabled={ytLoading}
          />
          <Button type="submit" disabled={ytLoading || !ytUrl.trim()}>
            {ytLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {ytLoading ? 'Adding...' : 'Add'}
          </Button>
        </form>

        {ytStatus && ytLoading && (
          <div className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-accent-muted text-accent">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            {ytStatus}
          </div>
        )}

        {ytMessage && (
          <div
            className={`px-3 py-2 rounded-lg text-sm flex items-start gap-2 ${
              ytMessage.type === 'success'
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {ytMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5" />
            )}
            {ytMessage.text}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Pasting a <span className="font-medium text-foreground">playlist URL</span> will
          extract every video and save each as an individual song in your library.
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
        <div className="flex-1 h-px bg-border" />
        Or upload your files
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-accent/50 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="w-12 h-12 text-muted mx-auto mb-4" />
        <p className="text-lg font-medium">
          Drop audio files here or click to browse
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          MP3, WAV, FLAC, M4A, OGG supported
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </h2>
            <Button onClick={uploadAll} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload all'}
            </Button>
          </div>

          <div className="space-y-3">
            {files.map((f, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center flex-shrink-0">
                      {f.status === 'done' ? (
                        <CheckCircle className="w-5 h-5 text-success" />
                      ) : f.status === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <Music className="w-5 h-5 text-accent" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {f.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(f.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                  {f.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {f.status === 'pending' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      placeholder="Song title"
                      value={f.title}
                      onChange={(e) => updateFile(i, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Artist"
                      value={f.artistName}
                      onChange={(e) =>
                        updateFile(i, { artistName: e.target.value })
                      }
                    />
                    <Input
                      placeholder="Album (optional)"
                      value={f.albumName}
                      onChange={(e) =>
                        updateFile(i, { albumName: e.target.value })
                      }
                    />
                  </div>
                )}

                {f.status === 'uploading' && (
                  <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}

                {f.error && (
                  <p className="text-xs text-destructive">{f.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    });
    audio.addEventListener('error', () => resolve(0));
    audio.src = URL.createObjectURL(file);
  });
}
