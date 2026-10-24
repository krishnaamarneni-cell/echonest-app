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

// Upgrade a YouTube thumbnail URL to the largest size YouTube publishes.
//
// hqdefault is only 480x360, and the player renders cover art in a ~400pt
// square with object-cover — so barely 360x360 real pixels get stretched
// across a box that wants ~800 on a retina display, which looks soft.
// maxresdefault is 1280x720, giving 720x720 after the square crop.
//
// Not every video has a maxresdefault (YouTube only generates it above a
// source-resolution threshold) and missing ones 404, so callers must fall
// back — see CoverArt, which retries with the original URL on error.
export function hiResCover(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^(https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11})\/[a-z]+\.jpg/);
  return m ? `${m[1]}/maxresdefault.jpg` : url;
}
