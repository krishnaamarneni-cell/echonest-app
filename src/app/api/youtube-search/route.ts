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
      const upstream = await fetch(url.toString(), { cache: 'no-store' });
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

  // Path 2: yt-proxy fallback
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) {
    return NextResponse.json(
      { error: 'No search backend configured (set YOUTUBE_API_KEY or yt-proxy env vars)' },
      { status: 503 },
    );
  }

  try {
    const url = `${proxyUrl}/search?q=${encodeURIComponent(q)}&s=${encodeURIComponent(proxySecret)}`;
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      return NextResponse.json(
        { error: `Proxy search ${upstream.status}: ${txt.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = await upstream.json();
    return NextResponse.json({ videos: data?.videos || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'proxy search failed' },
      { status: 502 },
    );
  }
}
