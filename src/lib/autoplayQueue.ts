/**
 * YouTube algorithmic-mix auto-queue.
 *
 * When the user listens to a YouTube song and the queue is running thin,
 * we ask the laptop proxy for the song's "Mix" (YouTube's autoplay radio)
 * and append synthetic Song objects to the queue. The synthesized songs
 * use the `yt-<videoId>` sentinel id so the rest of the player (recently
 * played, library checks, etc.) knows not to try a Supabase lookup.
 */

import { Song, QueueItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface RecommendedVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

export async function fetchRecommendations(
  videoId: string,
): Promise<RecommendedVideo[]> {
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return [];
  try {
    const url = `${proxyUrl.replace(/\/+$/, '')}/recommend/${videoId}?s=${encodeURIComponent(proxySecret)}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = (await r.json()) as { items?: RecommendedVideo[] };
    return data.items || [];
  } catch {
    return [];
  }
}

/**
 * Turn a list of recommended videos into Song-shaped queue items so the
 * AudioPlayer can play them with no special-casing. We mark them as
 * `source='youtube_embed'` and give them the ad-hoc `yt-<id>` id.
 *
 * Caller is expected to filter out videoIds already in the queue.
 */
export function videosToQueueItems(
  videos: RecommendedVideo[],
  alreadyInQueue: Set<string>,
): QueueItem[] {
  return videos
    .filter((v) => !alreadyInQueue.has(`yt-${v.videoId}`))
    .map((v) => {
      const song: Song = {
        id: `yt-${v.videoId}`,
        user_id: '',
        title: v.title,
        artist_name: v.channel,
        album_name: null,
        album_id: null,
        artist_id: null,
        duration: 0,
        file_url: '',
        cover_url: v.thumbnail,
        genre: null,
        track_number: null,
        source: 'youtube_embed',
        youtube_id: v.videoId,
        youtube_kind: 'video',
        content_type: 'music',
        created_at: new Date().toISOString(),
      };
      return {
        id: uuidv4(),
        song,
        source: 'queue' as const,
      };
    });
}
