import { NextRequest, NextResponse } from 'next/server';
import { PodcastEpisode } from '@/lib/podcasts';

/**
 * Latest episodes for one podcast channel.
 *
 *   GET /api/podcasts/episodes?handle=lexfridman
 *   GET /api/podcasts/episodes?uploads=UU...      (skips the lookup)
 *
 * Deliberately avoids search.list?channelId=...&order=date (100 units) in
 * favour of resolving the channel's uploads playlist and reading it:
 *   channels.list     1 unit
 *   playlistItems     1 unit
 *   videos.list       1 unit  (durations, which playlistItems omits)
 * Three units per load instead of a hundred, and the uploads playlist is
 * always complete and already newest-first.
 */

function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const handle = url.searchParams.get('handle')?.trim().replace(/^@/, '');
  let uploads = url.searchParams.get('uploads')?.trim();
  // Over-fetch because Shorts are filtered out below and they can be most
  // of a channel's recent uploads by count.
  const requested = Math.min(Number(url.searchParams.get('max') || '25'), 50);
  const maxResults = 50;
  const keepShorts = url.searchParams.get('shorts') === '1';

  if (!uploads && !handle) {
    return NextResponse.json({ error: 'handle or uploads required' }, { status: 400 });
  }

  let channelTitle = '';
  let channelThumb = '';
  let channelId = '';

  try {
    if (!uploads && handle) {
      const ch = new URL('https://www.googleapis.com/youtube/v3/channels');
      ch.searchParams.set('part', 'snippet,contentDetails');
      ch.searchParams.set('forHandle', `@${handle}`);
      ch.searchParams.set('key', apiKey);
      const cr = await fetch(ch.toString(), { next: { revalidate: 86_400 } });
      if (!cr.ok) {
        const detail = await cr.text().catch(() => '');
        return NextResponse.json(
          { error: `YouTube API ${cr.status}`, detail: detail.slice(0, 200) },
          { status: 502 },
        );
      }
      const cdata = (await cr.json()) as {
        items?: {
          id?: string;
          snippet?: { title?: string; thumbnails?: { high?: { url?: string } } };
          contentDetails?: { relatedPlaylists?: { uploads?: string } };
        }[];
      };
      const item = cdata.items?.[0];
      uploads = item?.contentDetails?.relatedPlaylists?.uploads;
      channelTitle = item?.snippet?.title || '';
      channelThumb = item?.snippet?.thumbnails?.high?.url || '';
      channelId = item?.id || '';
      if (!uploads) {
        return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
      }
    }

    // Newest uploads. Episodes appear as they're published, so an hour of
    // caching is plenty and keeps repeat visits free.
    const pl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    pl.searchParams.set('part', 'snippet,contentDetails');
    pl.searchParams.set('playlistId', uploads as string);
    pl.searchParams.set('maxResults', String(maxResults));
    pl.searchParams.set('key', apiKey);
    const pr = await fetch(pl.toString(), { next: { revalidate: 3_600 } });
    if (!pr.ok) {
      const detail = await pr.text().catch(() => '');
      return NextResponse.json(
        { error: `YouTube API ${pr.status}`, detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }
    const pdata = (await pr.json()) as {
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

    const raw = (pdata.items || [])
      .map((i) => ({
        videoId: i.contentDetails?.videoId || '',
        title: i.snippet?.title || 'Untitled',
        channel: i.snippet?.videoOwnerChannelTitle || channelTitle || 'Podcast',
        thumbnail:
          i.snippet?.thumbnails?.high?.url ||
          i.snippet?.thumbnails?.medium?.url ||
          (i.contentDetails?.videoId
            ? `https://i.ytimg.com/vi/${i.contentDetails.videoId}/hqdefault.jpg`
            : ''),
        publishedAt: i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt || '',
      }))
      // Private or deleted uploads stay in the playlist with no videoId.
      .filter((v) => v.videoId && v.title !== 'Private video' && v.title !== 'Deleted video');

    // playlistItems carries no duration, so fetch it for the whole page in
    // one videos.list call rather than per episode.
    const durations = new Map<string, number>();
    if (raw.length > 0) {
      const vids = new URL('https://www.googleapis.com/youtube/v3/videos');
      vids.searchParams.set('part', 'contentDetails');
      vids.searchParams.set('id', raw.map((v) => v.videoId).join(','));
      vids.searchParams.set('key', apiKey);
      const vr = await fetch(vids.toString(), { next: { revalidate: 3_600 } });
      if (vr.ok) {
        const vdata = (await vr.json()) as {
          items?: { id?: string; contentDetails?: { duration?: string } }[];
        };
        for (const v of vdata.items || []) {
          if (v.id) durations.set(v.id, parseIsoDuration(v.contentDetails?.duration));
        }
      }
    }

    // YouTube caps Shorts at 3 minutes, so anything at or under that is
    // almost always one. duration 0 means videos.list didn't answer for that
    // id — kept rather than dropped for something we failed to measure.
    const MIN_DURATION_SECONDS = 181;
    const episodes: PodcastEpisode[] = raw
      .map((v) => ({ ...v, duration: durations.get(v.videoId) || 0 }))
      .filter(
        (v) => keepShorts || v.duration === 0 || v.duration >= MIN_DURATION_SECONDS,
      )
      .slice(0, requested);

    return NextResponse.json({
      channelTitle,
      channelThumb,
      channelId,
      uploadsPlaylistId: uploads,
      episodes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
}
