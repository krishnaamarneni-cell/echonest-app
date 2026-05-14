import { NextRequest, NextResponse } from 'next/server';
import { Innertube } from 'youtubei.js';

// Resolves a YouTube video's direct audio URL via youtubei.js (the
// Innertube client), then 302-redirects the <audio> element to it.
// youtubei.js handles YouTube's bot-check more robustly than ytdl-core,
// which is why we try it on Vercel where ytdl-core was blocked.

type CachedUrl = { url: string; expiresAt: number };
const urlCache = new Map<string, CachedUrl>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

let yt: Innertube | null = null;
async function getClient(): Promise<Innertube> {
  if (!yt) {
    yt = await Innertube.create({
      // Default client = WEB. iOS / TV_EMBEDDED clients sometimes bypass
      // bot checks on cloud IPs — we'll fall back if WEB fails.
    });
  }
  return yt;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!secret) return true;
  return req.nextUrl.searchParams.get('s') === secret;
}

async function resolveAudioUrl(videoId: string): Promise<string> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const client = await getClient();

  // Try WEB client first, fall back to IOS / TV_EMBEDDED on bot check
  const clientsToTry: Array<'WEB' | 'IOS' | 'TV_EMBEDDED' | 'ANDROID'> = [
    'WEB',
    'IOS',
    'TV_EMBEDDED',
    'ANDROID',
  ];

  let lastErr: unknown = null;
  for (const clientType of clientsToTry) {
    try {
      // @ts-expect-error youtubei.js client param accepted at runtime
      const info = await client.getInfo(videoId, clientType);
      const fmt =
        info.streaming_data?.adaptive_formats?.find(
          (f) => f.itag === 140 && f.url,
        ) ||
        info.streaming_data?.adaptive_formats?.find(
          (f) => f.has_audio && !f.has_video && f.url,
        );
      if (fmt?.url) {
        urlCache.set(videoId, {
          url: fmt.url,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return fmt.url;
      }
      // Some clients return decipher-needed URLs — youtubei.js handles that
      // via toDash() / chooseFormat() helpers; let's also try its own
      // dash manifest route as a last resort.
      lastErr = new Error(`No usable audio format from ${clientType} client`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All clients failed');
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const audioUrl = await resolveAudioUrl(id);
    return NextResponse.redirect(audioUrl, 302);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Resolve failed' },
      { status: 502 },
    );
  }
}
