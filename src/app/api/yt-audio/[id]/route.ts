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

  // Try multiple Innertube clients — formats returned and decipher
  // requirements vary by client. Pick the first one that gives us a
  // deciphered, playable URL.
  const clientsToTry: string[] = [
    'IOS_MUSIC',
    'ANDROID_MUSIC',
    'IOS',
    'ANDROID',
    'TV_EMBEDDED',
    'WEB_REMIX',
    'WEB',
  ];

  // Track diagnostic info per client so the error response tells us
  // which step is failing for which client.
  const attempts: Record<string, string> = {};
  for (const clientType of clientsToTry) {
    try {
      // @ts-expect-error youtubei.js client param accepted at runtime
      const info = await client.getInfo(videoId, clientType);

      if (!info?.streaming_data?.adaptive_formats?.length) {
        attempts[clientType] =
          info?.playability_status?.status === 'OK'
            ? 'no streaming_data'
            : `status: ${info?.playability_status?.status || 'unknown'} - ${info?.playability_status?.reason || ''}`.slice(0, 80);
        continue;
      }

      let chosen;
      try {
        chosen = info.chooseFormat({
          type: 'audio',
          quality: 'best',
          format: 'mp4',
        });
      } catch {
        try {
          chosen = info.chooseFormat({ type: 'audio', quality: 'best' });
        } catch (e) {
          attempts[clientType] = `chooseFormat: ${e instanceof Error ? e.message : String(e)}`.slice(0, 80);
          continue;
        }
      }

      // Get the deciphered URL. youtubei.js exposes decipher() on the
      // format object that handles signature decoding.
      let url = chosen?.url;
      if (!url && chosen && 'decipher' in chosen && client.session?.player) {
        try {
          // @ts-expect-error decipher exists at runtime
          url = chosen.decipher(client.session.player);
        } catch {}
      }

      if (url) {
        urlCache.set(videoId, {
          url,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return url;
      }
      attempts[clientType] = 'no deciphered URL';
    } catch (e) {
      attempts[clientType] = (e instanceof Error ? e.message : String(e)).slice(0, 80);
    }
  }
  // No client worked — throw an error that reveals what each client said
  throw new Error(
    'All clients failed: ' + JSON.stringify(attempts).slice(0, 600),
  );
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
