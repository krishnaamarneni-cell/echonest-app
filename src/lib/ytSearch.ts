import { Song } from '@/types';

export interface YtVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

// Search YouTube through the personal proxy (yt-dlp). No API key needed.
export async function proxySearch(query: string, signal?: AbortSignal): Promise<YtVideo[]> {
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return [];
  try {
    const r = await fetch(
      `${proxyUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&s=${encodeURIComponent(proxySecret)}`,
      { cache: 'no-store', signal },
    );
    if (!r.ok) return [];
    const d = (await r.json()) as { videos?: YtVideo[] };
    return (d.videos || []).filter((v) => v.videoId);
  } catch {
    return [];
  }
}

// Run several related queries and merge into one de-duplicated list — used by
// the "See all" page to surface more than a single search returns.
export async function proxySearchMany(queries: string[], signal?: AbortSignal): Promise<YtVideo[]> {
  const results = await Promise.all(queries.map((q) => proxySearch(q, signal)));
  const seen = new Set<string>();
  const merged: YtVideo[] = [];
  for (const list of results) {
    for (const v of list) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      merged.push(v);
    }
  }
  return merged;
}

// Build a playable, in-memory Song from a YouTube search result. The `yt-`
// id means it streams through the proxy without being written to the library.
export function ytVideoToSong(v: YtVideo): Song {
  return {
    id: `yt-${v.videoId}`,
    user_id: '',
    title: v.title,
    artist_name: v.channel || 'YouTube',
    album_name: null,
    album_id: null,
    artist_id: null,
    duration: 0,
    file_url: '',
    cover_url: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    genre: null,
    track_number: null,
    source: 'youtube_embed',
    youtube_id: v.videoId,
    youtube_kind: 'video',
    content_type: 'music',
    created_at: new Date().toISOString(),
  };
}
