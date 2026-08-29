import { NextRequest, NextResponse } from 'next/server';

// Returns YouTube's "Trending → Music" chart for a given region.
// Uses videos.list?chart=mostPopular&videoCategoryId=10 — the official
// trending feed maintained by YouTube. Returns up to 20 videos with
// real view/like/comment counts.

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

function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
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
      return NextResponse.json(
        { error: `YouTube API ${r.status}`, detail: text.slice(0, 200) },
        { status: 502 },
      );
    }
    const data = (await r.json()) as { items?: YouTubeVideoItem[] };

    const items = (data.items || [])
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

    return NextResponse.json({ region: region.toUpperCase(), items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
}
