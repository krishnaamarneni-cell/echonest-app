import { NextRequest, NextResponse } from 'next/server';

// Search YouTube for videos via the Data API and return the top results.
// Requires YOUTUBE_API_KEY set on the deployment.
// Quota: 100 units per search × 10,000 daily = 100 searches/day on free tier.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ videos: [] });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY not configured' },
      { status: 503 },
    );
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '12');
  url.searchParams.set('q', q);
  url.searchParams.set('key', apiKey);
  // Bias toward music & spoken content — exclude live streams / Shorts noise.
  url.searchParams.set('videoEmbeddable', 'true');

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: 'no-store' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `YouTube API ${upstream.status}: ${text.slice(0, 200)}` },
      { status: upstream.status },
    );
  }

  const data = (await upstream.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: {
          medium?: { url?: string };
          high?: { url?: string };
          default?: { url?: string };
        };
      };
    }>;
  };

  const videos = (data.items || [])
    .map((it) => {
      const videoId = it.id?.videoId;
      if (!videoId) return null;
      const thumb =
        it.snippet?.thumbnails?.high?.url ||
        it.snippet?.thumbnails?.medium?.url ||
        it.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        videoId,
        title: it.snippet?.title || 'Untitled',
        channel: it.snippet?.channelTitle || 'YouTube',
        thumbnail: thumb,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return NextResponse.json({ videos });
}
