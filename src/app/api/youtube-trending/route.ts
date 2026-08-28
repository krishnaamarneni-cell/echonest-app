import { NextRequest, NextResponse } from 'next/server';

// Returns YouTube's "Trending → Music" chart for a given region.
// Uses videos.list?chart=mostPopular&videoCategoryId=10 — the official
// trending feed maintained by YouTube. Returns up to 50 videos with
// real view/like/comment counts.
//
// YouTube publishes no worldwide chart, so ?region=global is synthesised
// here: we pull the largest music markets in parallel and merge their
// feeds (see GLOBAL_REGIONS + rankGlobal). Passing "global" straight
// through as a regionCode is what YouTube rejects with a 400.

interface YouTubeStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

interface YouTubeSnippet {
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
}

interface YouTubeVideoItem {
  id?: string;
  snippet?: YouTubeSnippet;
  contentDetails?: { duration?: string };
  statistics?: YouTubeStatistics;
}

interface ChartItem {
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

// One merged video plus the markets it charted in — the raw material the
// Global ranking works on.
interface GlobalEntry {
  item: ChartItem;
  regions: string[];
}

// fetchRegionChart never rejects; it reports failure in-band so one bad
// market can't take down the whole Global merge.
type ChartResult =
  | { ok: true; items: ChartItem[] }
  | { ok: false; error: string; detail?: string };

// Markets blended into the synthetic "Global" chart — picked to span the
// biggest music audiences without letting any single language dominate.
// Each is 1 unit of YouTube quota and the result is cached for an hour,
// so the whole set costs 10 units per refresh.
const GLOBAL_REGIONS = ['US', 'IN', 'GB', 'JP', 'KR', 'BR', 'MX', 'DE', 'ID', 'NG'];

function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function toChartItems(items: YouTubeVideoItem[]): ChartItem[] {
  return items
    .filter((v) => v.id)
    .map((v) => {
      const thumb =
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
      return {
        videoId: v.id!,
        title: v.snippet?.title || 'Untitled',
        channel: v.snippet?.channelTitle || 'YouTube',
        publishedAt: v.snippet?.publishedAt || '',
        thumbnail: thumb,
        duration: parseIsoDuration(v.contentDetails?.duration),
        viewCount: Number(v.statistics?.viewCount || 0),
        likeCount: Number(v.statistics?.likeCount || 0),
        commentCount: Number(v.statistics?.commentCount || 0),
      };
    });
}

async function fetchRegionChart(
  apiKey: string,
  region: string,
  maxResults: number,
): Promise<ChartResult> {
  const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  ytUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
  ytUrl.searchParams.set('chart', 'mostPopular');
  ytUrl.searchParams.set('videoCategoryId', '10'); // Music
  ytUrl.searchParams.set('regionCode', region.toUpperCase());
  ytUrl.searchParams.set('maxResults', String(maxResults));
  ytUrl.searchParams.set('key', apiKey);

  try {
    // Cache for 1 hour — YouTube trending doesn't change second-by-second.
    const r = await fetch(ytUrl.toString(), { next: { revalidate: 3600 } });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false, error: `YouTube API ${r.status}`, detail: text.slice(0, 200) };
    }
    const data = (await r.json()) as { items?: YouTubeVideoItem[] };
    return { ok: true, items: toChartItems(data.items || []) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

// Ranking policy for the synthetic Global chart.
//
// Breadth first, then volume: a track trending in eight markets is more
// genuinely "global" than one with enormous view counts in a single
// market. Sorting on viewCount alone would just float the biggest
// all-time videos that happen to still be trending somewhere, which reads
// as a greatest-hits list rather than a chart of what's hot now.
function rankGlobal(entries: GlobalEntry[]): GlobalEntry[] {
  return [...entries].sort((a, b) => {
    if (b.regions.length !== a.regions.length) return b.regions.length - a.regions.length;
    return b.item.viewCount - a.item.viewCount;
  });
}

async function globalChart(apiKey: string, maxResults: number) {
  const settled = await Promise.all(
    GLOBAL_REGIONS.map((r) => fetchRegionChart(apiKey, r, 50)),
  );

  // Collapse to one entry per video, recording every market it appeared in.
  const byVideo = new Map<string, GlobalEntry>();
  settled.forEach((res, i) => {
    if (!res.ok) return;
    for (const item of res.items) {
      const existing = byVideo.get(item.videoId);
      if (existing) existing.regions.push(GLOBAL_REGIONS[i]);
      else byVideo.set(item.videoId, { item, regions: [GLOBAL_REGIONS[i]] });
    }
  });

  const merged = [...byVideo.values()];
  if (merged.length === 0) {
    // Every market failed — surface the first real reason rather than an
    // empty chart the UI would render as "no songs".
    const firstFailure = settled.find((r) => !r.ok);
    return NextResponse.json(
      {
        error: firstFailure && !firstFailure.ok ? firstFailure.error : 'No global chart data',
        detail: firstFailure && !firstFailure.ok ? firstFailure.detail : undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    region: 'GLOBAL',
    items: rankGlobal(merged).slice(0, maxResults).map((e) => e.item),
  });
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  // Region: default to user's country code if Vercel injects it, else IN
  // (based on EchoNest's primary user). Override with ?region= query.
  const url = new URL(req.url);
  const region =
    url.searchParams.get('region') ||
    req.headers.get('x-vercel-ip-country') ||
    'IN';
  const maxResults = Math.min(Number(url.searchParams.get('max') || '20'), 50);

  if (region.toUpperCase() === 'GLOBAL') {
    return globalChart(apiKey, maxResults);
  }

  const res = await fetchRegionChart(apiKey, region, maxResults);
  if (!res.ok) {
    return NextResponse.json({ error: res.error, detail: res.detail }, { status: 502 });
  }
  return NextResponse.json({ region: region.toUpperCase(), items: res.items });
}
