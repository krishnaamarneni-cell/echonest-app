import { NextRequest, NextResponse } from 'next/server';

interface YTVideoMeta {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
}

interface YTPlaylistItem {
  snippet: {
    title: string;
    resourceId: { videoId: string };
    videoOwnerChannelTitle?: string;
    thumbnails?: { default?: { url: string }; medium?: { url: string }; high?: { url: string } };
  };
}

/**
 * Server-side extraction of every video in a YouTube playlist via the
 * YouTube Data API v3. Paginated, so it handles playlists of any size
 * (no 200-video cap like the client-side IFrame API has).
 *
 * Requires YOUTUBE_API_KEY env var. Free key from
 * https://console.cloud.google.com → enable "YouTube Data API v3"
 * (10,000 quota units/day default — each playlistItems.list call costs 1).
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'YouTube API key not configured. Add YOUTUBE_API_KEY to your Vercel env vars to extract playlists larger than 200 videos.',
      },
      { status: 503 },
    );
  }

  let body: { playlistId?: string; idsOnly?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const playlistId = body.playlistId;
  if (!playlistId) {
    return NextResponse.json({ error: 'playlistId required' }, { status: 400 });
  }

  // 1. Get playlist title + thumbnail
  let playlistTitle = 'Imported playlist';
  let playlistThumb: string | null = null;
  try {
    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`,
    );
    const plData = await plRes.json();
    const snip = plData.items?.[0]?.snippet;
    if (snip) {
      playlistTitle = snip.title || playlistTitle;
      playlistThumb =
        snip.thumbnails?.high?.url ||
        snip.thumbnails?.medium?.url ||
        snip.thumbnails?.default?.url ||
        null;
    }
  } catch {
    // continue with defaults
  }

  // 2. Paginate through all playlistItems
  const videos: YTVideoMeta[] = [];
  let pageToken = '';
  let safetyMax = 100; // worst-case 100 pages × 50 = 5000 videos

  try {
    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}${
        pageToken ? `&pageToken=${pageToken}` : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        return NextResponse.json(
          { error: data.error.message || 'YouTube API error' },
          { status: 400 },
        );
      }

      for (const item of (data.items as YTPlaylistItem[]) || []) {
        const videoId = item.snippet.resourceId?.videoId;
        if (!videoId) continue;
        if (body.idsOnly) {
          videos.push({
            videoId,
            title: '',
            author: '',
            thumbnail: '',
          });
        } else {
          const thumb =
            item.snippet.thumbnails?.high?.url ||
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          videos.push({
            videoId,
            title: item.snippet.title || `Video ${videoId}`,
            author: item.snippet.videoOwnerChannelTitle || 'YouTube',
            thumbnail: thumb,
          });
        }
      }

      pageToken = data.nextPageToken || '';
      safetyMax -= 1;
    } while (pageToken && safetyMax > 0);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch playlist' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    playlistTitle,
    playlistThumb,
    videos,
    count: videos.length,
  });
}
