import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

// Resolves a YouTube video's direct audio CDN URL via ytdl-core, then
// 302-redirects the browser there. The <audio> element follows the
// redirect and streams audio bytes directly from YouTube's CDN — Vercel
// never relays the audio, so we stay well under any bandwidth quota.
//
// Replaces the previous Fly.io yt-proxy entirely.
//
// In-memory cache (resets on Vercel cold start, but warm instances share)
// keeps repeat-plays / listen-along catchups instant.

type CachedUrl = { url: string; expiresAt: number };
const urlCache = new Map<string, CachedUrl>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — YouTube signed URLs last ~6h

// Quick auth — anyone hitting from EchoNest is allowed; outsiders need
// the shared secret. The secret is exposed via NEXT_PUBLIC, so this is
// soft protection meant to prevent accidental abuse, not strong auth.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!secret) return true; // unconfigured = open (only safe for personal use)
  const qs = req.nextUrl.searchParams.get('s');
  return qs === secret;
}

async function resolveAudioUrl(videoId: string): Promise<string> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  // Prefer audio-only m4a (itag 140) for Safari compatibility, else best audio
  let format = info.formats.find((f) => f.itag === 140);
  if (!format) {
    format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
  }
  if (!format?.url) throw new Error('No audio format found');

  urlCache.set(videoId, { url: format.url, expiresAt: Date.now() + CACHE_TTL_MS });
  return format.url;
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
