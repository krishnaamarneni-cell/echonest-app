/**
 * Bulk-import top-N YouTube songs for a saved artist into the user's library.
 *
 * Why we do this client-side:
 *  - We need the laptop proxy's yt-dlp search (no API quota, no bot wall)
 *    which is already publicly reachable from the app
 *  - Supabase RLS handles auth on inserts
 *  - No need for a server route
 *
 * Per-artist flow:
 *  1. Search the proxy for the artist name → up to 12 candidates
 *  2. Skip any whose youtube_id is already in songs(artist_id=<artist>)
 *  3. Insert up to `limit` new song rows linked to this artist
 */

import { createClient } from '@/lib/supabase/client';
import { Artist } from '@/types';

export interface ImportResult {
  artist: Artist;
  added: number;
  skipped: number;
  error?: string;
}

interface ProxySearchVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

async function searchProxy(query: string): Promise<ProxySearchVideo[]> {
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) {
    throw new Error('Proxy is not configured (NEXT_PUBLIC_YT_PROXY_URL / SECRET missing)');
  }
  const url = `${proxyUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&s=${encodeURIComponent(proxySecret)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Search returned ${resp.status}`);
  const data = (await resp.json()) as { videos?: ProxySearchVideo[] };
  return data.videos || [];
}

export async function importArtistSongs(
  artist: Artist,
  limit: number = 10,
): Promise<ImportResult> {
  const supabase = createClient();
  try {
    // Who is this for? RLS will enforce user_id; we need it for the insert payload.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { artist, added: 0, skipped: 0, error: 'Not signed in' };
    }

    // What's already linked to this artist? Skip duplicates by youtube_id.
    const { data: existingRows } = await supabase
      .from('songs')
      .select('youtube_id')
      .eq('artist_id', artist.id)
      .not('youtube_id', 'is', null);
    const existing = new Set(
      (existingRows || []).map((r: { youtube_id: string }) => r.youtube_id),
    );

    // Search the proxy for the artist name.
    const candidates = await searchProxy(artist.name);
    const fresh = candidates
      .filter((v) => !existing.has(v.videoId))
      .slice(0, limit);

    if (fresh.length === 0) {
      return { artist, added: 0, skipped: candidates.length };
    }

    // Insert in bulk. Each row is a YouTube embed pointing at the artist.
    const rows = fresh.map((v) => ({
      user_id: user.id,
      title: v.title,
      artist_name: artist.name,
      artist_id: artist.id,
      duration: 0, // unknown until first play; that's OK, AudioPlayer fills it
      file_url: '',
      cover_url: v.thumbnail,
      source: 'youtube_embed' as const,
      youtube_id: v.videoId,
      youtube_kind: 'video' as const,
      content_type: 'music' as const,
    }));

    const { error: insertError } = await supabase.from('songs').insert(rows);
    if (insertError) {
      return { artist, added: 0, skipped: 0, error: insertError.message };
    }

    return {
      artist,
      added: fresh.length,
      skipped: candidates.length - fresh.length,
    };
  } catch (e) {
    return {
      artist,
      added: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Import for many artists sequentially. Calls `onProgress` after each artist
 * so the UI can render a live "X / N" indicator.
 */
export async function importArtistsBulk(
  artists: Artist[],
  limit: number,
  onProgress?: (done: number, total: number, last: ImportResult) => void,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  for (let i = 0; i < artists.length; i++) {
    const r = await importArtistSongs(artists[i], limit);
    results.push(r);
    onProgress?.(i + 1, artists.length, r);
  }
  return results;
}
