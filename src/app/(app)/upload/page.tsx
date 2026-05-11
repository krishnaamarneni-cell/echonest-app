'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Upload, Music, CheckCircle, AlertCircle, X, Link2, Plus, Loader2 } from 'lucide-react';
import {
  parseYouTubeUrl,
  extractYouTubePlaylist,
  fetchPlaylistMeta,
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
  const [contentType, setContentType] = useState<'music' | 'podcast' | 'artist' | 'album'>('music');
  const [targetPlaylistName, setTargetPlaylistName] = useState('');

  // Helper: find or create a playlist matching the given name + content type,
  // then return its id. Used by both YT-video and file-upload flows.
  const ensureTargetPlaylist = async (
    supabase: ReturnType<typeof createClient>,
    userId: string,
  ): Promise<string | null> => {
    const name = targetPlaylistName.trim();
    if (!name) return null;
    const { data: existing } = await supabase
      .from('playlists')
      .select('id')
      .eq('user_id', userId)
      .eq('title', name)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created } = await supabase
      .from('playlists')
      .insert({
        user_id: userId,
        title: name,
        content_type: contentType,
      })
      .select('id')
      .single();
    return created?.id || null;
  };

  // Find or create artist rows for the given names. Returns name -> id map.
  const ensureArtists = async (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    names: string[],
  ): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    const unique = Array.from(
      new Set(names.map((n) => n?.trim()).filter((n): n is string => !!n && n !== 'Unknown Artist')),
    );
    if (unique.length === 0) return result;

    const { data: existing } = await supabase
      .from('artists')
      .select('id, name')
      .eq('user_id', userId)
      .in('name', unique);
    for (const a of existing || []) {
      if (a.name) result.set(a.name as string, a.id as string);
    }

    const missing = unique.filter((n) => !result.has(n));
    if (missing.length > 0) {
      const { data: created } = await supabase
        .from('artists')
        .insert(missing.map((name) => ({ name, user_id: userId })))
        .select('id, name');
      for (const a of created || []) {
        if (a.name) result.set(a.name as string, a.id as string);
      }
    }
    return result;
  };

  const linkSongToPlaylist = async (
    supabase: ReturnType<typeof createClient>,
    playlistId: string,
    songId: string,
  ) => {
    const { data: maxRow } = await supabase
      .from('playlist_songs')
      .select('position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    await supabase.from('playlist_songs').insert({
      playlist_id: playlistId,
      song_id: songId,
      position: nextPos,
    });
    await supabase
      .from('playlists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', playlistId);
  };

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
        // 1. Extract every video in the playlist.
        // First try the server endpoint (uses YT Data API, unlimited size).
        // Fall back to client-side IFrame extractor (capped at 200 videos)
        // if YOUTUBE_API_KEY isn't configured on the server.
        setYtStatus('Loading playlist…');
        let videos: { videoId: string; title: string; author: string; thumbnail: string }[];
        let serverPlaylistTitle: string | null = null;
        let serverPlaylistThumb: string | null = null;
        try {
          const serverRes = await fetch('/api/youtube-playlist-extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId: parsed.id }),
          });
          if (serverRes.ok) {
            const data = await serverRes.json();
            videos = data.videos;
            serverPlaylistTitle = data.playlistTitle || null;
            serverPlaylistThumb = data.playlistThumb || null;
          } else if (serverRes.status === 503) {
            // No API key configured — fall back to client-side
            videos = await extractYouTubePlaylist(parsed.id);
          } else {
            const errData = await serverRes.json().catch(() => ({}));
            setYtMessage({
              type: 'error',
              text: errData.error || 'Could not load playlist',
            });
            setYtLoading(false);
            setYtStatus('');
            return;
          }
        } catch (err) {
          // Network or extraction failure — fall back to client method
          try {
            videos = await extractYouTubePlaylist(parsed.id);
          } catch (innerErr) {
            setYtMessage({
              type: 'error',
              text:
                innerErr instanceof Error
                  ? innerErr.message
                  : err instanceof Error
                  ? err.message
                  : 'Could not load playlist',
            });
            setYtLoading(false);
            setYtStatus('');
            return;
          }
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

        // 2. Get the playlist's title + thumbnail (for the auto-created EchoNest playlist).
        // Use server-provided values if available, else fall back to oEmbed.
        let playlistTitle = serverPlaylistTitle;
        let playlistCover = serverPlaylistThumb;
        if (!playlistTitle) {
          const playlistMeta = await fetchPlaylistMeta(parsed.id);
          playlistTitle = playlistMeta?.title || null;
          playlistCover = playlistCover || playlistMeta?.thumbnail || null;
        }
        playlistTitle = playlistTitle || 'Imported playlist';
        playlistCover = playlistCover || videos[0]?.thumbnail || null;

        // 3. Save songs (skipping ones already in the user's library)
        const videoIds = videos.map((v) => v.videoId);
        const { data: existing } = await supabase
          .from('songs')
          .select('id, youtube_id')
          .eq('user_id', user.id)
          .eq('source', 'youtube_embed')
          .eq('youtube_kind', 'video')
          .in('youtube_id', videoIds);

        const existingMap = new Map<string, string>(); // videoId -> songId
        for (const s of existing || []) {
          if (s.youtube_id) existingMap.set(s.youtube_id as string, s.id as string);
        }

        // Pre-create artist rows so songs can be linked by artist_id (needed
        // for Library → Artists tab).
        const artistMap = await ensureArtists(
          supabase,
          user.id,
          videos.map((v) => v.author),
        );

        const newSongRows = videos
          .filter((v) => !existingMap.has(v.videoId))
          .map((v) => ({
            user_id: user.id,
            title: v.title,
            artist_name: v.author,
            artist_id: artistMap.get(v.author?.trim()) || null,
            cover_url: v.thumbnail,
            file_url: '',
            duration: 0,
            source: 'youtube_embed',
            youtube_id: v.videoId,
            youtube_kind: 'video',
            content_type: contentType,
          }));

        // Insert new songs in batches and collect their ids
        const insertedIds = new Map<string, string>(); // videoId -> songId
        const batchSize = 100;
        let inserted = 0;
        for (let i = 0; i < newSongRows.length; i += batchSize) {
          const batch = newSongRows.slice(i, i + batchSize);
          const { data: created, error } = await supabase
            .from('songs')
            .insert(batch)
            .select('id, youtube_id');
          if (error) {
            setYtMessage({
              type: 'error',
              text: `Saved ${inserted}/${newSongRows.length} songs, then failed: ${error.message}`,
            });
            setYtLoading(false);
            setYtStatus('');
            return;
          }
          for (const s of created || []) {
            if (s.youtube_id) insertedIds.set(s.youtube_id as string, s.id as string);
          }
          inserted += batch.length;
          setYtStatus(`Saving songs… ${inserted}/${newSongRows.length}`);
        }

        // 4. Resolve the destination playlist.
        // - If the user typed a name in "Add to playlist", use that — find
        //   an existing playlist of theirs with that name, or create one.
        // - Otherwise create a new playlist using the YouTube playlist title.
        setYtStatus('Creating playlist…');
        const customName = targetPlaylistName.trim();
        const finalPlaylistTitle = customName || playlistTitle;

        let createdPlaylist: { id: string } | null = null;
        let playlistError: { message: string } | null = null;

        if (customName) {
          const { data: existingPl } = await supabase
            .from('playlists')
            .select('id')
            .eq('user_id', user.id)
            .eq('title', customName)
            .maybeSingle();
          if (existingPl) {
            createdPlaylist = { id: existingPl.id as string };
          }
        }

        if (!createdPlaylist) {
          const res = await supabase
            .from('playlists')
            .insert({
              user_id: user.id,
              title: finalPlaylistTitle,
              description: `Imported from YouTube`,
              cover_url: playlistCover,
              source_youtube_id: parsed.id,
              last_synced_at: new Date().toISOString(),
              content_type: contentType,
            })
            .select('id')
            .single();
          createdPlaylist = res.data ? { id: res.data.id as string } : null;
          playlistError = res.error;
        }

        if (playlistError || !createdPlaylist) {
          // Songs are saved; just couldn't create the playlist
          setYtMessage({
            type: 'success',
            text: `Saved ${newSongRows.length} songs to your library, but couldn't create a playlist: ${playlistError?.message || 'unknown error'}`,
          });
          setYtUrl('');
          setYtLoading(false);
          setYtStatus('');
          return;
        }

        // 5. Link every song (existing + newly inserted) to the playlist.
        // If we're appending to an existing playlist, skip songs already in
        // it and start positions after the current max.
        const { data: existingLinks } = await supabase
          .from('playlist_songs')
          .select('song_id, position')
          .eq('playlist_id', createdPlaylist.id);
        const alreadyLinked = new Set<string>(
          (existingLinks || []).map((r) => r.song_id as string),
        );
        const startPos =
          (existingLinks || []).reduce(
            (max, r) => Math.max(max, (r.position as number) ?? -1),
            -1,
          ) + 1;

        const playlistSongRows = videos
          .map((v) => {
            const songId = existingMap.get(v.videoId) || insertedIds.get(v.videoId);
            if (!songId) return null;
            if (alreadyLinked.has(songId)) return null;
            return { playlist_id: createdPlaylist!.id, song_id: songId };
          })
          .filter((r): r is { playlist_id: string; song_id: string } => r !== null)
          .map((r, i) => ({ ...r, position: startPos + i }));

        if (playlistSongRows.length > 0) {
          // Insert playlist_songs in batches too
          for (let i = 0; i < playlistSongRows.length; i += batchSize) {
            const batch = playlistSongRows.slice(i, i + batchSize);
            const { error } = await supabase.from('playlist_songs').insert(batch);
            if (error) {
              setYtMessage({
                type: 'error',
                text: `Saved songs and created the playlist, but couldn't add songs to it: ${error.message}`,
              });
              setYtLoading(false);
              setYtStatus('');
              return;
            }
          }
        }

        const skippedCount = videos.length - newSongRows.length;
        setYtMessage({
          type: 'success',
          text:
            skippedCount > 0
              ? `Added ${newSongRows.length} new songs to "${finalPlaylistTitle}" (${skippedCount} were already in your library and added too)`
              : `Created playlist "${finalPlaylistTitle}" with ${videos.length} songs`,
        });
        setYtUrl('');
      } else {
        // Single video — keep using the existing API endpoint
        const res = await fetch('/api/youtube-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: ytUrl, contentType }),
        });
        const data = await res.json();

        if (!res.ok) {
          setYtMessage({ type: 'error', text: data.error || 'Failed to add' });
        } else {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();

          // Ensure an artist row exists and link the song to it so it shows
          // up under Library → Artists.
          if (user && data.song?.id && data.song?.artist_name) {
            const artistMap = await ensureArtists(supabase, user.id, [data.song.artist_name]);
            const artistId = artistMap.get(data.song.artist_name.trim());
            if (artistId) {
              await supabase
                .from('songs')
                .update({ artist_id: artistId })
                .eq('id', data.song.id);
            }
          }

          // If user provided a playlist name, find or create it and link the song
          let playlistSuffix = '';
          if (user && targetPlaylistName.trim()) {
            const playlistId = await ensureTargetPlaylist(supabase, user.id);
            if (playlistId && data.song?.id) {
              await linkSongToPlaylist(supabase, playlistId, data.song.id);
              playlistSuffix = ` to "${targetPlaylistName.trim()}"`;
            }
          }
          setYtMessage({
            type: 'success',
            text: `Added "${data.song.title}"${playlistSuffix}`,
          });
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

      const { data: insertedSong, error: insertError } = await supabase
        .from('songs')
        .insert({
          title: f.title,
          artist_name: f.artistName,
          album_name: f.albumName || null,
          album_id: albumId,
          artist_id: artistId,
          file_url: publicUrl,
          duration,
          user_id: user.id,
          content_type: contentType,
        })
        .select('id')
        .single();

      if (insertError) {
        updateFile(i, { status: 'error', error: insertError.message });
      } else {
        // Link to target playlist if user named one
        if (insertedSong?.id && targetPlaylistName.trim()) {
          const playlistId = await ensureTargetPlaylist(supabase, user.id);
          if (playlistId) {
            await linkSongToPlaylist(supabase, playlistId, insertedSong.id);
          }
        }
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
      <div className="relative bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 sm:p-6 space-y-5 overflow-hidden">
        {/* Decorative gradient blob */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
            <Link2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold">Add from YouTube</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Video or playlist URL → streams via the official embed, no download.
            </p>
          </div>
        </div>

        {/* Type selector — card grid */}
        <div className="relative space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              What are you adding?
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                {
                  value: 'music',
                  label: 'Music',
                  emoji: '🎵',
                  gradient: 'from-purple-500/20 to-pink-500/20',
                  ring: 'ring-purple-500',
                },
                {
                  value: 'podcast',
                  label: 'Podcast',
                  emoji: '🎙️',
                  gradient: 'from-amber-500/20 to-orange-500/20',
                  ring: 'ring-amber-500',
                },
                {
                  value: 'artist',
                  label: 'Artist',
                  emoji: '🎤',
                  gradient: 'from-cyan-500/20 to-blue-500/20',
                  ring: 'ring-cyan-500',
                },
                {
                  value: 'album',
                  label: 'Album',
                  emoji: '💿',
                  gradient: 'from-emerald-500/20 to-teal-500/20',
                  ring: 'ring-emerald-500',
                },
              ] as const
            ).map((opt) => {
              const isActive = contentType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setContentType(opt.value)}
                  className={`relative bg-gradient-to-br ${opt.gradient} border rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    isActive
                      ? `border-transparent ring-2 ${opt.ring} shadow-lg`
                      : 'border-border hover:border-foreground/20'
                  }`}
                >
                  <div className="text-2xl mb-1">{opt.emoji}</div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent shadow-lg shadow-accent/50" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional playlist target */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Add to playlist (optional)
          </label>
          <Input
            placeholder={
              contentType === 'podcast'
                ? 'e.g. JRE, The Daily, Lex Fridman…'
                : 'Playlist name — creates one if it doesn\'t exist'
            }
            value={targetPlaylistName}
            onChange={(e) => setTargetPlaylistName(e.target.value)}
          />
          <p className="text-[10px] text-muted">
            Single video or pasted playlist URL? If you put a name here, every track you add
            below also lands in that playlist (created automatically if new).
          </p>
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
