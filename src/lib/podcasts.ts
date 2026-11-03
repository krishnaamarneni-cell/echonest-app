import { Song } from '@/types';

/**
 * Podcast discovery.
 *
 * YouTube has no "top podcasts" API — there's no chart endpoint for
 * channels the way videos.list has chart=mostPopular. So the featured row
 * is a curated seed list of handles, resolved against the Data API at
 * request time so the title, artwork and episode list always come from
 * YouTube rather than being hardcoded here.
 *
 * Handles do get retired or renamed, so anything that fails to resolve is
 * skipped rather than rendered broken — see /api/podcasts/channels. To
 * change what's featured, edit FEATURED_PODCASTS; nothing else needs to
 * know. Anything not listed here is reachable through search.
 */

export interface PodcastChannel {
  /** YouTube handle without the leading @ — the stable public identifier. */
  handle: string;
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount: number;
  /** Playlist holding every upload — how we list episodes cheaply. */
  uploadsPlaylistId: string;
}

export interface PodcastEpisode {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
  duration: number;
  /** Lifetime plays. Only meaningful when the caller asked to rank by it. */
  views?: number;
}

/**
 * Seed list for the featured row. Order here is the order shown, so this
 * doubles as the "top 10" ranking — YouTube can't tell us popularity for
 * channels, and subscriber count alone ranks talk shows oddly.
 */
export const FEATURED_PODCASTS: string[] = [
  'joerogan',           // The Joe Rogan Experience (PowerfulJRE)
  'lexfridman',         // Lex Fridman Podcast
  'hubermanlab',        // Huberman Lab
  'TheDiaryOfACEO',     // The Diary Of A CEO
  'BeerBiceps',         // The Ranveer Show
  'TheoVon',            // This Past Weekend w/ Theo Von
  'aliabdaal',          // Deep Dive
  'ColinandSamir',      // The Colin and Samir Show
  'TED',                // TED
  'WVFRM',              // Waveform
];

/**
 * Seed list for the News page. Every handle here was verified against the
 * Data API — a wrong handle silently resolves to something unrelated rather
 * than failing (@BloombergTelevision, for instance, is a Korean diary
 * channel), so these are checked rather than guessed.
 *
 * Mix of global wires and Indian/Telugu outlets. Like the podcast list this
 * is just a starting point — anything else is reachable through search and
 * "Add to News".
 */
/**
 * There is deliberately no featured list for artists.
 *
 * The handles above were each checked against the Data API, because a wrong
 * one does not fail — it resolves to some unrelated channel and sits in the
 * row looking legitimate. No equivalent list could be verified for music,
 * and a plausible guess is the worst outcome here, so the Artists page
 * suggests searches from the artists already in your library instead.
 */
export const FEATURED_ARTISTS: string[] = [];

export const FEATURED_NEWS: string[] = [
  'CNN',               // CNN
  'BBCNews',           // BBC News
  'CNBC',              // CNBC
  'Reuters',           // Reuters
  'aljazeeraenglish',  // Al Jazeera English
  'markets',           // Bloomberg Television
  'AajTak',            // Aaj Tak
  'ABPNEWS',           // ABP NEWS
  'NDTV',              // NDTV
  'IndiaToday',        // India Today
  'WION',              // WION
  'tv9telugulive',     // TV9 Telugu Live
];

/** Compact subscriber counts for display: 18200000 -> "18.2M subscribers". */
export function formatSubscribers(n: number): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M subscribers`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K subscribers`;
  return `${n} subscribers`;
}

/** "3 days ago" / "2 months ago" for episode recency. */
export function timeAgo(iso: string): string {
  if (!iso) return '';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [31_536_000, 'year'],
    [2_592_000, 'month'],
    [604_800, 'week'],
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, label] of units) {
    const v = Math.floor(secs / size);
    if (v >= 1) return `${v} ${label}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/**
 * Turn an episode into a playable Song. The `yt-` id prefix is the existing
 * sentinel telling the rest of the player this is ad-hoc and must not be
 * looked up in Supabase, and the content_type keeps episodes out of the
 * music rows on Home and in Library.
 *
 * The category must be passed in: a news clip, a podcast episode and a
 * song are the same shape coming back from YouTube, and only the caller
 * knows which list it came from. It decides more than labelling — the
 * player shows video for 'podcast' and 'news' and plays audio alone for
 * 'music', which is why an artist's uploads arrive here as music.
 */
export function episodeToSong(
  ep: PodcastEpisode,
  contentType: 'podcast' | 'news' | 'music' = 'podcast',
): Song {
  return {
    id: `yt-${ep.videoId}`,
    user_id: '',
    title: ep.title,
    artist_name: ep.channel,
    album_name: null,
    album_id: null,
    artist_id: null,
    duration: ep.duration,
    file_url: '',
    cover_url: ep.thumbnail || `https://i.ytimg.com/vi/${ep.videoId}/hqdefault.jpg`,
    genre: null,
    track_number: null,
    source: 'youtube_embed',
    youtube_id: ep.videoId,
    youtube_kind: 'video',
    content_type: contentType,
    created_at: ep.publishedAt || new Date().toISOString(),
  };
}
