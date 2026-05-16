import { create } from 'zustand';
import { Song } from '@/types';
import {
  saveOfflineSong,
  deleteOfflineSong,
  listOfflineIds,
  listOfflineSongs,
  getOfflineSong,
  requestPersistentStorage,
  OfflineSongRecord,
} from '@/lib/offline-storage';

interface OfflineState {
  /** ids of songs available offline (loaded from IndexedDB on app start) */
  ids: Set<string>;
  /** songId -> progress percent (0-100); presence in this map means actively downloading */
  inProgress: Map<string, number>;
  /** songId -> error message if last download failed */
  errors: Map<string, string>;
  loaded: boolean;
  loadIds: () => Promise<void>;
  isAvailable: (songId: string) => boolean;
  getProgress: (songId: string) => number | undefined;
  getError: (songId: string) => string | undefined;
  downloadSong: (song: Song) => Promise<void>;
  /** Download every eligible song in the list, sequentially. Resolves when all done. */
  downloadMany: (songs: Song[]) => Promise<{ done: number; failed: number }>;
  remove: (songId: string) => Promise<void>;
  /** Pull a Blob URL for the given song id, or null if not cached. */
  getBlobUrl: (songId: string) => Promise<string | null>;
  /** Listing for the Downloads page (full records). */
  listAll: () => Promise<OfflineSongRecord[]>;
}

/**
 * Songs eligible for download: YouTube-backed video items only. Uploaded
 * Supabase files already play natively from their file_url. Playlist YT
 * items (whole playlists as one entry) are not downloadable — only the
 * underlying videos are.
 */
export function isDownloadable(song: Song): boolean {
  return (
    !!song.youtube_id &&
    song.youtube_kind === 'video' &&
    song.content_type !== 'podcast' &&
    song.source === 'youtube_embed'
  );
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  ids: new Set(),
  inProgress: new Map(),
  errors: new Map(),
  loaded: false,

  loadIds: async () => {
    if (get().loaded) return;
    try {
      const ids = await listOfflineIds();
      set({ ids: new Set(ids), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  isAvailable: (songId) => get().ids.has(songId),

  getProgress: (songId) => get().inProgress.get(songId),

  getError: (songId) => get().errors.get(songId),

  downloadSong: async (song) => {
    if (!isDownloadable(song)) return;
    if (get().ids.has(song.id)) return;
    if (get().inProgress.has(song.id)) return;

    const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
    const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
    if (!proxyUrl || !proxySecret) {
      const msg =
        'Background-play proxy is not configured. Download requires the proxy server.';
      set((s) => {
        const errors = new Map(s.errors);
        errors.set(song.id, msg);
        return { errors };
      });
      throw new Error(msg);
    }

    // First download? Try to upgrade storage to persistent so the browser
    // doesn't auto-evict under pressure.
    requestPersistentStorage().catch(() => {});

    // Downloads have to go through the proxy bytes path — the redirect
    // alternative (?direct=1) would land on googlevideo.com, which has
    // no CORS headers, so browser fetch() refuses to read the body.
    // <audio> playback can still use direct mode because the element
    // doesn't enforce CORS for cross-origin media sources.
    const url = `${proxyUrl.replace(/\/+$/, '')}/audio/${song.youtube_id}?s=${encodeURIComponent(proxySecret)}`;

    // Mark as 0% so UI flips to "downloading" state immediately
    set((s) => {
      const inProgress = new Map(s.inProgress);
      inProgress.set(song.id, 0);
      const errors = new Map(s.errors);
      errors.delete(song.id);
      return { inProgress, errors };
    });

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Proxy returned ${resp.status}`);
      }
      const total = Number(resp.headers.get('content-length') || 0);
      const mime = resp.headers.get('content-type') || 'audio/mp4';

      // Stream + track progress. Fall back to plain .blob() if no body
      // reader (older browsers).
      let blob: Blob;
      if (resp.body && total > 0) {
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            const pct = Math.min(99, Math.floor((received / total) * 100));
            set((s) => {
              const inProgress = new Map(s.inProgress);
              if (inProgress.has(song.id)) inProgress.set(song.id, pct);
              return { inProgress };
            });
          }
        }
        blob = new Blob(chunks as BlobPart[], { type: mime });
      } else {
        blob = await resp.blob();
      }

      const record: OfflineSongRecord = {
        id: song.id,
        blob,
        mime,
        size: blob.size,
        title: song.title,
        artist: song.artist_name,
        cover_url: song.cover_url,
        duration: song.duration,
        youtube_id: song.youtube_id,
        downloaded_at: Date.now(),
      };
      await saveOfflineSong(record);

      set((s) => {
        const ids = new Set(s.ids);
        ids.add(song.id);
        const inProgress = new Map(s.inProgress);
        inProgress.delete(song.id);
        const errors = new Map(s.errors);
        errors.delete(song.id);
        return { ids, inProgress, errors };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => {
        const inProgress = new Map(s.inProgress);
        inProgress.delete(song.id);
        const errors = new Map(s.errors);
        errors.set(song.id, msg);
        return { inProgress, errors };
      });
      throw e;
    }
  },

  downloadMany: async (songs) => {
    const eligible = songs.filter(isDownloadable);
    let done = 0;
    let failed = 0;
    // Sequential to avoid hammering the proxy (yt-dlp is slow under
    // concurrency anyway).
    for (const song of eligible) {
      if (get().ids.has(song.id)) {
        done++;
        continue;
      }
      try {
        await get().downloadSong(song);
        done++;
      } catch {
        failed++;
      }
    }
    return { done, failed };
  },

  remove: async (songId) => {
    try {
      await deleteOfflineSong(songId);
    } catch {}
    set((s) => {
      const ids = new Set(s.ids);
      ids.delete(songId);
      const inProgress = new Map(s.inProgress);
      inProgress.delete(songId);
      const errors = new Map(s.errors);
      errors.delete(songId);
      return { ids, inProgress, errors };
    });
  },

  getBlobUrl: async (songId) => {
    try {
      const rec = await getOfflineSong(songId);
      if (!rec) return null;
      return URL.createObjectURL(rec.blob);
    } catch {
      return null;
    }
  },

  listAll: async () => {
    try {
      return await listOfflineSongs();
    } catch {
      return [];
    }
  },
}));
