import { NextRequest, NextResponse } from 'next/server';

// Search YouTube and return matching videos.
// Two paths:
//   1. If YOUTUBE_API_KEY is set: use the official Data API (fast, quota-limited)
//   2. Otherwise: fall back to yt-proxy's /search endpoint (uses yt-dlp,
//      slower but no API key needed)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ videos: [] });

  const apiKey = process.env.YOUTUBE_API_KEY;

  // Path 1: official YouTube Data API
  if (apiKey) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '12');
    url.searchParams.set('q', q);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('videoEmbeddable', 'true');

    try {
      const upstream = await fetch(url.toString(), { next: { revalidate: 300 } });
      if (upstream.ok) {
        const data = (await upstream.json()) as {
          items?: Array<{
            id?: { videoId?: string };
            snippet?: {
              title?: string;
              channelTitle?: string;
              thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } };
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
      // Fall through to proxy on Data API failure
    } catch {
      // Fall through to proxy on network error
    }
  }

  // Path 2: fall back to the laptop proxy's yt-dlp search. Reached when
  // there's no API key at all, or when the Data API failed above — most
  // importantly on quota exhaustion (search.list is 100 units a call, so
  // a busy day can burn the daily allowance). Slower, but it keeps search
  // working instead of returning a hard 503.
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL?.trim();
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET?.trim();
  if (proxyUrl && proxySecret) {
    try {
      const r = await fetch(
        `${proxyUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(q)}&s=${encodeURIComponent(proxySecret)}`,
        { cache: 'no-store' },
      );
      if (r.ok) {
        const d = (await r.json()) as { videos?: unknown[] };
        return NextResponse.json({ videos: d.videos || [] });
      }
    } catch {
      // fall through to the error below
    }
  }

  return NextResponse.json(
    { error: 'YouTube search is unavailable — the Data API failed and the proxy is unreachable.' },
    { status: 503 },
  );
}
