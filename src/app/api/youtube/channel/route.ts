import { NextRequest, NextResponse } from 'next/server';

/**
 * Which channel published this video?
 *
 *   GET /api/youtube/channel?video=<11-char videoId>
 *
 * Exists so the artist name under the player can be tapped. A song that
 * came from YouTube carries its channel's *title* and nothing else — there
 * is no handle or channel id on the row — so opening "RITVIZ" from Now
 * Playing means asking YouTube who published that video.
 *
 * Two calls, both 1 unit: videos.list gives the channelId, channels.list
 * turns it into the handle and uploads playlist the artist page needs.
 * Neither changes, so both cache for a day and a given song is resolved
 * once per deployment rather than once per tap.
 */

interface ChannelInfo {
  channelId: string;
  title: string;
  /** Without the leading @. Empty when the channel never claimed one. */
  handle: string;
  thumbnail: string;
  uploadsPlaylistId: string;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const video = params.get('video')?.trim() || '';
  let channelId = params.get('id')?.trim() || '';

  if (!channelId && !/^[A-Za-z0-9_-]{11}$/.test(video)) {
    return NextResponse.json({ error: 'video or id required' }, { status: 400 });
  }

  try {
    if (!channelId) {
      const v = new URL('https://www.googleapis.com/youtube/v3/videos');
      v.searchParams.set('part', 'snippet');
      v.searchParams.set('id', video);
      v.searchParams.set('key', apiKey);
      const vr = await fetch(v.toString(), { next: { revalidate: 86_400 } });
      if (!vr.ok) {
        return NextResponse.json({ error: `YouTube API ${vr.status}` }, { status: 502 });
      }
      const vdata = (await vr.json()) as {
        items?: { snippet?: { channelId?: string } }[];
      };
      channelId = vdata.items?.[0]?.snippet?.channelId || '';
      // A deleted or private video resolves to nothing. Said plainly so the
      // caller can fall back to searching by name rather than showing an
      // artist page for the wrong channel.
      if (!channelId) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }
    }

    const c = new URL('https://www.googleapis.com/youtube/v3/channels');
    c.searchParams.set('part', 'snippet,contentDetails');
    c.searchParams.set('id', channelId);
    c.searchParams.set('key', apiKey);
    const cr = await fetch(c.toString(), { next: { revalidate: 86_400 } });
    if (!cr.ok) {
      return NextResponse.json({ error: `YouTube API ${cr.status}` }, { status: 502 });
    }
    const cdata = (await cr.json()) as {
      items?: {
        id?: string;
        snippet?: {
          title?: string;
          customUrl?: string;
          thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }[];
    };
    const item = cdata.items?.[0];
    if (!item?.id) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const channel: ChannelInfo = {
      channelId: item.id,
      title: item.snippet?.title || '',
      handle: (item.snippet?.customUrl || '').replace(/^@/, ''),
      thumbnail:
        item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || '',
    };
    return NextResponse.json({ channel });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'lookup failed' },
      { status: 502 },
    );
  }
}
