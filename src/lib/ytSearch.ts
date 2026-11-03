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

/**
 * Ask the proxy who is credited on a video.
 *
 * Only needed when the artist line is truncated ("… and 3 more") — the
 * search and mix endpoints run flat, so that is all they ever return.
 * Costs a full yt-dlp extraction, so it is called on tap and nowhere else.
 *
 * An empty list is a normal answer: a plain upload carries no music
 * credits, and the proxy lives on a laptop that is often simply off.
 */
export async function proxyCredits(
  videoId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return [];
  try {
    const r = await fetch(
      `${proxyUrl.replace(/\/+$/, '')}/credits/${encodeURIComponent(videoId)}?s=${encodeURIComponent(proxySecret)}`,
      { cache: 'no-store', signal },
    );
    if (!r.ok) return [];
    const d = (await r.json()) as { artists?: string[] };
    return (d.artists || []).filter(Boolean);
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

/**
 * Does this look like a compilation rather than a single song?
 *
 * A query like "latest english songs 2026" is catnip for hour-long
 * jukebox/mix uploads that pack 30-40 tracks into one video. They're
 * useless in a "latest songs" row — you can't tell what you're getting and
 * you can't skip within it — so they're filtered out by title, which is all
 * yt-dlp's search returns (no duration field to threshold on).
 *
 * Deliberately conservative: it matches compilation *markers*, not merely
 * long titles, so a normal track called "Songs of Freedom" still passes.
 */
export function isCompilation(title: string): boolean {
  const t = title.toLowerCase();
  return [
    /\btop\s*\d+/, // "Top 50", "Top 100"
    /\bjukebox\b/,
    /\bnon[\s-]?stop\b/,
    /\bback\s*to\s*back\b/,
    /\bmashup\b/,
    /\bmegamix\b/,
    /\b(audio|video|song|hit)s?\s*(mix|playlist)\b/,
    /\bfull\s*(album|movie)\b/,
    /\ball\s*songs\b/,
    /\bhits?\s*(of\s*)?\d{4}\b/, // "Hits 2026"
    /\b\d{2,}\s*songs?\b/, // "40 songs"
    /\bcollection\b/,
    /\bcompilation\b/,
  ].some((re) => re.test(t));
}

/**
 * Is this upload a song, rather than something else a music label posts?
 *
 * A label's channel is not a discography. Between the tracks sit trailers,
 * teasers, first looks, audio launches, press meets, interviews, making-of
 * reels and whole films — on a Telugu or Tamil music channel those can
 * outnumber the songs in any given month. Listing a channel's uploads as
 * "songs" without this filter puts a two-hour movie and a 40-second teaser
 * in the same queue as the tracks.
 *
 * Rejects by marker, like isCompilation, and errs toward keeping things:
 * "Lyrical", "Lyric Video", "Video Song" and "Audio Song" are all songs and
 * must pass. Only an unmistakable non-song marker fails.
 */
export function isLikelySong(title: string): boolean {
  const t = title.toLowerCase();
  if (isCompilation(t)) return false;
  return ![
    /\btrailer\b/,
    /\bteaser\b/,
    /\bfirst\s*look\b/,
    /\bglimpse\b/,
    /\bmaking\b/, // "making of", "song making"
    /\bbehind\s*the\s*scenes?\b/,
    /\bbts\b/,
    /\binterview\b/,
    /\bpress\s*(meet|conference)\b/,
    /\b(audio|music)\s*launch\b/,
    /\bpre[\s-]?release\b/,
    /\bsuccess\s*(meet|celebrations?)\b/,
    /\bthank\s*you\s*meet\b/,
    /\bpromo\b/,
    /\bannouncement\b/,
    /\breaction\b/,
    /\breview\b/,
    /\b(movie|comedy|action|deleted|best)\s*scenes?\b/,
    /\bepisode\s*\d+/,
    /\bep\.?\s*\d+\b/,
    /\bshorts?\b/,
    /\bwhatsapp\s*status\b/,
    /\blive\s*(stream|performance|concert)\b/,
  ].some((re) => re.test(t));
}
