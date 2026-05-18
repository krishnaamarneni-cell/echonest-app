import type { Song } from '@/types';

// Effective cover URL for a song. Prefers an explicit cover_url; for
// youtube_embed songs whose cover_url is missing, falls back to the
// YouTube hqdefault thumbnail (always available for any valid video).
// Returns null when neither is available so callers can render a
// placeholder icon.
export function coverFor(song: Pick<Song, 'cover_url' | 'youtube_id'> | undefined | null): string | null {
  if (!song) return null;
  if (song.cover_url) return song.cover_url;
  if (song.youtube_id) return `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`;
  return null;
}
