import { NextRequest, NextResponse } from 'next/server';
import { FEATURED_PODCASTS, PodcastChannel } from '@/lib/podcasts';

/**
 * Resolve podcast channels for the featured row, or search for new ones.
 *
 *   GET /api/podcasts/channels                  -> the featured seed list
 *   GET /api/podcasts/channels?handles=a,b,c    -> those specific handles
 *   GET /api/podcasts/channels?q=joe+rogan      -> search for channels
 *
 * Quota notes, because they drive the design:
 *   channels.list  = 1 unit  (and accepts up to 50 ids in ONE call)
 *   search.list    = 100 units
 * So the featured row resolves handles one at a time (1 unit each, cached
 * for a day) and search is only ever hit on an explicit query.
 */

interface YouTubeChannel {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
  };
  statistics?: { subscriberCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

const PARTS = 'snippet,statistics,contentDetails';

function toChannel(c: YouTubeChannel, fallbackHandle: string): PodcastChannel | null {
  const channelId = c.id;
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (!channelId || !uploads) return null;
  return {
    handle: (c.snippet?.customUrl || fallbackHandle).replace(/^@/, ''),
    channelId,
    title: c.snippet?.title || fallbackHandle,
    description: c.snippet?.description || '',
    thumbnail:
      c.snippet?.thumbnails?.high?.url ||
      c.snippet?.thumbnails?.medium?.url ||
      c.snippet?.thumbnails?.default?.url ||
      '',
    subscriberCount: Number(c.statistics?.subscriberCount || 0),
    uploadsPlaylistId: uploads,
  };
}

/** Never throws — a retired handle resolves to null and is skipped. */
async function resolveHandle(apiKey: string, handle: string): Promise<PodcastChannel | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', PARTS);
  url.searchParams.set('forHandle', `@${handle.replace(/^@/, '')}`);
  url.searchParams.set('key', apiKey);
  try {
    // Channel metadata barely changes; a day of caching keeps the featured
    // row at ~0 quota after first load.
    const r = await fetch(url.toString(), { next: { revalidate: 86_400 } });
    if (!r.ok) return null;
    const data = (await r.json()) as { items?: YouTubeChannel[] };
    const item = data.items?.[0];
    return item ? toChannel(item, handle) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();

  // --- search mode -------------------------------------------------------
  if (q) {
    const search = new URL('https://www.googleapis.com/youtube/v3/search');
    search.searchParams.set('part', 'snippet');
    search.searchParams.set('type', 'channel');
    search.searchParams.set('maxResults', '12');
    search.searchParams.set('q', q);
    search.searchParams.set('key', apiKey);
    try {
      const r = await fetch(search.toString(), { next: { revalidate: 3_600 } });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return NextResponse.json(
          { error: `YouTube API ${r.status}`, detail: detail.slice(0, 200) },
          { status: 502 },
        );
      }
      const data = (await r.json()) as {
        items?: { id?: { channelId?: string } }[];
      };
      const ids = (data.items || [])
        .map((i) => i.id?.channelId)
        .filter((v): v is string => Boolean(v));
      if (ids.length === 0) return NextResponse.json({ channels: [] });

      // search.list omits statistics and uploads playlist, so hydrate all
      // hits with ONE channels.list call (1 unit for up to 50 ids).
      const hydrate = new URL('https://www.googleapis.com/youtube/v3/channels');
      hydrate.searchParams.set('part', PARTS);
      hydrate.searchParams.set('id', ids.join(','));
      hydrate.searchParams.set('key', apiKey);
      const hr = await fetch(hydrate.toString(), { next: { revalidate: 3_600 } });
      if (!hr.ok) return NextResponse.json({ channels: [] });
      const hdata = (await hr.json()) as { items?: YouTubeChannel[] };
      const channels = (hdata.items || [])
        .map((c) => toChannel(c, c.snippet?.customUrl || ''))
        .filter((c): c is PodcastChannel => c !== null);
      return NextResponse.json({ channels });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'search failed' },
        { status: 502 },
      );
    }
  }

  // --- featured / explicit handles ---------------------------------------
  const handlesParam = url.searchParams.get('handles');
  const handles = handlesParam
    ? handlesParam.split(',').map((h) => h.trim()).filter(Boolean).slice(0, 20)
    : FEATURED_PODCASTS;

  const resolved = await Promise.all(handles.map((h) => resolveHandle(apiKey, h)));
  const channels = resolved.filter((c): c is PodcastChannel => c !== null);

  // Every handle failing means the API itself is unhappy (bad key, quota),
  // not ten simultaneously retired channels — say so rather than rendering
  // an empty page that looks like "no podcasts exist".
  if (channels.length === 0 && handles.length > 0) {
    return NextResponse.json(
      { error: "Couldn't load podcasts from YouTube", channels: [] },
      { status: 502 },
    );
  }
  return NextResponse.json({ channels });
}
