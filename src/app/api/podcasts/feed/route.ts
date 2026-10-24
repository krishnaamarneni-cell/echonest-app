import { NextRequest, NextResponse } from 'next/server';

/**
 * Merged feed across several channels.
 *
 *   GET /api/podcasts/feed?uploads=UU111,UU222,UU333
 *
 * Powers the Latest / Top rows on the News and Podcasts pages: the client
 * already holds each followed channel's uploads playlist id (copied in when
 * the channel was followed), so this needs no channel lookup at all.
 *
 * Quota: 1 unit per channel for playlistItems, plus ONE videos.list for
 * every video across all of them (durations and view counts, which
 * playlistItems omits). Following ten channels costs 11 units a refresh,
 * cached for 15 minutes.
 */

const MAX_CHANNELS = 20;
const PER_CHANNEL = 10;

interface FeedItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
  duration: number;
  viewCount: number;
}

function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/** Never rejects — one dead playlist shouldn't blank the whole feed. */
async function fetchPlaylist(apiKey: string, uploads: string): Promise<FeedItem[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', uploads);
  url.searchParams.set('maxResults', String(PER_CHANNEL));
  url.searchParams.set('key', apiKey);
  try {
    const r = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      items?: {
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
        snippet?: {
          title?: string;
          videoOwnerChannelTitle?: string;
          publishedAt?: string;
          thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        };
      }[];
    };
    return (data.items || [])
      .map((i) => ({
        videoId: i.contentDetails?.videoId || '',
        title: i.snippet?.title || 'Untitled',
        channel: i.snippet?.videoOwnerChannelTitle || '',
        thumbnail:
          i.snippet?.thumbnails?.high?.url ||
          i.snippet?.thumbnails?.medium?.url ||
          (i.contentDetails?.videoId
            ? `https://i.ytimg.com/vi/${i.contentDetails.videoId}/hqdefault.jpg`
            : ''),
        publishedAt: i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt || '',
        duration: 0,
        viewCount: 0,
      }))
      // Private/deleted uploads stay in the playlist with no usable videoId.
      .filter((v) => v.videoId && v.title !== 'Private video' && v.title !== 'Deleted video');
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  const uploads = (new URL(req.url).searchParams.get('uploads') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CHANNELS);

  if (uploads.length === 0) return NextResponse.json({ items: [] });

  const lists = await Promise.all(uploads.map((u) => fetchPlaylist(apiKey, u)));
  const merged: FeedItem[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const v of list) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      merged.push(v);
    }
  }
  if (merged.length === 0) return NextResponse.json({ items: [] });

  // One videos.list for everything, rather than one per channel.
  const ids = merged.map((v) => v.videoId);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const vurl = new URL('https://www.googleapis.com/youtube/v3/videos');
    vurl.searchParams.set('part', 'contentDetails,statistics');
    vurl.searchParams.set('id', batch.join(','));
    vurl.searchParams.set('key', apiKey);
    try {
      const vr = await fetch(vurl.toString(), { next: { revalidate: 900 } });
      if (!vr.ok) continue;
      const vdata = (await vr.json()) as {
        items?: {
          id?: string;
          contentDetails?: { duration?: string };
          statistics?: { viewCount?: string };
        }[];
      };
      const byId = new Map(vdata.items?.map((v) => [v.id, v]) || []);
      for (const item of merged) {
        const v = byId.get(item.videoId);
        if (!v) continue;
        item.duration = parseIsoDuration(v.contentDetails?.duration);
        item.viewCount = Number(v.statistics?.viewCount || 0);
      }
    } catch {
      // leave duration/views at 0 for this batch
    }
  }

  merged.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  return NextResponse.json({ items: merged });
}
