import { NextRequest, NextResponse } from 'next/server';

// Returns authoritative metadata (duration in seconds) for a YouTube
// video. Used to override the audio element's flaky duration estimate
// when streaming through the proxy — the audio element sometimes
// reports doubled duration after backgrounding/rebuffering.

// Parse ISO 8601 duration like "PT3M21S" → seconds
function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 503 });
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', id);
  url.searchParams.set('key', apiKey);

  try {
    const r = await fetch(url.toString(), { next: { revalidate: 86400 } });
    if (!r.ok) return NextResponse.json({ error: `YT ${r.status}` }, { status: 502 });
    const data = (await r.json()) as {
      items?: Array<{ contentDetails?: { duration?: string } }>;
    };
    const iso = data.items?.[0]?.contentDetails?.duration;
    if (!iso) return NextResponse.json({ error: 'No duration in response' }, { status: 404 });
    return NextResponse.json({ duration: parseIsoDuration(iso) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
}
