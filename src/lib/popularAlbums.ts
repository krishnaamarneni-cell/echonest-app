/**
 * Curated bootstrap list of popular albums.
 *
 * Mix of recent global hits + Indian / South-Indian albums (based on the
 * user's existing library bias toward Anirudh Ravichander / Aditya Music
 * etc). Each album triggers:
 *   1. INSERT INTO albums (title, artist_name, year, ...)
 *   2. yt-dlp search for "artist title"
 *   3. INSERT up to N songs with album_id = the new album's id
 *
 * Duplicate-safe: if an album with the same (title, artist_name) already
 * exists for the user, we reuse the existing row rather than creating a new
 * one. Songs are deduped by youtube_id within the album.
 */

import { createClient } from '@/lib/supabase/client';

export interface AlbumSeed {
  title: string;
  artist: string;
  year?: number;
}

export const POPULAR_ALBUMS: AlbumSeed[] = [
  // Recent global
  { title: 'The Tortured Poets Department', artist: 'Taylor Swift', year: 2024 },
  { title: 'HIT ME HARD AND SOFT', artist: 'Billie Eilish', year: 2024 },
  { title: 'GNX', artist: 'Kendrick Lamar', year: 2024 },
  { title: 'Short n’ Sweet', artist: 'Sabrina Carpenter', year: 2024 },
  { title: 'CHROMAKOPIA', artist: 'Tyler, The Creator', year: 2024 },
  { title: 'Brat', artist: 'Charli XCX', year: 2024 },
  { title: 'Cowboy Carter', artist: 'Beyoncé', year: 2024 },
  { title: 'UTOPIA', artist: 'Travis Scott', year: 2023 },

  // South Indian
  { title: 'Leo', artist: 'Anirudh Ravichander', year: 2023 },
  { title: 'Jawan', artist: 'Anirudh Ravichander', year: 2023 },
  { title: 'Master', artist: 'Anirudh Ravichander', year: 2021 },
  { title: 'Devara', artist: 'Anirudh Ravichander', year: 2024 },
  { title: 'Pushpa 2 The Rule', artist: 'Devi Sri Prasad', year: 2024 },
  { title: 'RRR', artist: 'M. M. Keeravani', year: 2022 },
  { title: 'KGF Chapter 2', artist: 'Ravi Basrur', year: 2022 },

  // Bollywood / Hindi
  { title: 'Pathaan', artist: 'Vishal-Shekhar', year: 2023 },
  { title: 'Animal', artist: 'Pritam', year: 2023 },
  { title: 'Brahmastra', artist: 'Pritam', year: 2022 },
  { title: 'Rocky Aur Rani Kii Prem Kahaani', artist: 'Pritam', year: 2023 },
  { title: 'Tamasha', artist: 'A. R. Rahman', year: 2015 },
];

export interface PopularAlbumResult {
  seed: AlbumSeed;
  albumId?: string;
  songsAdded: number;
  reused: boolean;
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
    throw new Error('Proxy is not configured');
  }
  const url = `${proxyUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&s=${encodeURIComponent(proxySecret)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Search returned ${resp.status}`);
  const data = (await resp.json()) as { videos?: ProxySearchVideo[] };
  return data.videos || [];
}

export async function importPopularAlbum(
  seed: AlbumSeed,
  songsPerAlbum: number = 10,
): Promise<PopularAlbumResult> {
  const supabase = createClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { seed, songsAdded: 0, reused: false, error: 'Not signed in' };
    }

    // Find or create album row (dedupe by user_id + title + artist_name)
    let albumId: string | null = null;
    let reused = false;
    const { data: existingAlbum } = await supabase
      .from('albums')
      .select('id, cover_url')
      .eq('user_id', user.id)
      .ilike('title', seed.title)
      .ilike('artist_name', seed.artist)
      .maybeSingle();

    if (existingAlbum) {
      albumId = existingAlbum.id as string;
      reused = true;
    } else {
      const { data: insertedAlbum, error: albumErr } = await supabase
        .from('albums')
        .insert({
          user_id: user.id,
          title: seed.title,
          artist_name: seed.artist,
          year: seed.year || null,
          cover_url: null, // will be set from first imported song's thumbnail
        })
        .select('id')
        .single();
      if (albumErr || !insertedAlbum) {
        return {
          seed,
          songsAdded: 0,
          reused: false,
          error: albumErr?.message || 'Failed to create album',
        };
      }
      albumId = insertedAlbum.id as string;
    }

    // Find existing youtube_ids on this album so we don't duplicate
    const { data: existingSongs } = await supabase
      .from('songs')
      .select('youtube_id')
      .eq('album_id', albumId)
      .not('youtube_id', 'is', null);
    const existing = new Set(
      (existingSongs || []).map((r: { youtube_id: string }) => r.youtube_id),
    );

    // Search YouTube
    const candidates = await searchProxy(`${seed.artist} ${seed.title}`);
    const fresh = candidates
      .filter((v) => !existing.has(v.videoId))
      .slice(0, songsPerAlbum);

    if (fresh.length === 0) {
      return { seed, albumId, songsAdded: 0, reused };
    }

    // Promote first thumbnail to album cover if album has none
    const firstThumb = fresh[0]?.thumbnail || null;
    if (firstThumb) {
      await supabase
        .from('albums')
        .update({ cover_url: firstThumb })
        .eq('id', albumId)
        .is('cover_url', null);
    }

    const rows = fresh.map((v) => ({
      user_id: user.id,
      title: v.title,
      artist_name: seed.artist,
      album_name: seed.title,
      album_id: albumId,
      duration: 0,
      file_url: '',
      cover_url: v.thumbnail,
      source: 'youtube_embed' as const,
      youtube_id: v.videoId,
      youtube_kind: 'video' as const,
      content_type: 'music' as const,
    }));

    const { error: insertErr } = await supabase.from('songs').insert(rows);
    if (insertErr) {
      return {
        seed,
        albumId,
        songsAdded: 0,
        reused,
        error: insertErr.message,
      };
    }

    return { seed, albumId, songsAdded: fresh.length, reused };
  } catch (e) {
    return {
      seed,
      songsAdded: 0,
      reused: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function importPopularAlbumsBulk(
  seeds: AlbumSeed[] = POPULAR_ALBUMS,
  songsPerAlbum: number = 10,
  onProgress?: (done: number, total: number, last: PopularAlbumResult) => void,
): Promise<PopularAlbumResult[]> {
  const results: PopularAlbumResult[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const r = await importPopularAlbum(seeds[i], songsPerAlbum);
    results.push(r);
    onProgress?.(i + 1, seeds.length, r);
  }
  return results;
}
