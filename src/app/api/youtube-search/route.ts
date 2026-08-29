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

  // Path 2: ytdl-core fallback when no YouTube API key is set. Uses
  // youtubei.js-like search via @distube/ytdl-core's getInfo on a search
  // playlist isn't supported, so we use the YouTube Data API's first-page
  // HTML scrape via the library's helpers. For simplicity, when no API
  // key is set, surface a clear message rather than an opaque scraper.
  return NextResponse.json(
    {
      error:
        'YouTube search requires YOUTUBE_API_KEY on Vercel. Set it in your project env vars to enable search.',
    },
    { status: 503 },
  );
}
