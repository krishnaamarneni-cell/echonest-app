import { NextRequest, NextResponse } from 'next/server';

/**
 * Lyrics proxy → LRCLIB.
 *
 * LRCLIB (lrclib.net) is a free, no-key-required open lyrics database
 * with both plain text and synced LRC. We call it server-side so the
 * client doesn't burn through their CORS preflight quota and so we
 * can cache responses at the edge for 24h.
 *
 * Query string:
 *   ?track=Song Title&artist=Artist Name[&album=Album][&duration=210]
 *
 * Returns:
 *   { synced: string | null, plain: string | null, source: 'lrclib' }
 *
 * synced is LRC-format text with [mm:ss.xx] timestamps; plain is the
 * fallback text-only version. Either may be null when nothing matches.
 */

interface LrclibResult {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const track = url.searchParams.get('track')?.trim();
  const artist = url.searchParams.get('artist')?.trim();
  const album = url.searchParams.get('album')?.trim() || '';
  const duration = url.searchParams.get('duration');
  if (!track || !artist) {
    return NextResponse.json(
      { error: 'track + artist are required' },
      { status: 400 },
    );
  }

  // Step 1: exact-match endpoint. Faster + most accurate when we have
  // metadata. Tolerant of missing duration.
  const exactUrl = new URL('https://lrclib.net/api/get');
  exactUrl.searchParams.set('track_name', track);
  exactUrl.searchParams.set('artist_name', artist);
  if (album) exactUrl.searchParams.set('album_name', album);
  if (duration) exactUrl.searchParams.set('duration', duration);

  try {
    const r = await fetch(exactUrl.toString(), {
      headers: {
        'User-Agent': 'EchoNest (https://echonest-app.vercel.app)',
      },
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const data = (await r.json()) as LrclibResult;
      return NextResponse.json({
        synced: data.syncedLyrics || null,
        plain: data.plainLyrics || null,
        source: 'lrclib',
      });
    }
    // 404 → fall through to fuzzy search
  } catch (e) {
    console.warn('lrclib exact lookup failed:', e);
  }

  // Step 2: fuzzy search by track + artist. Returns array sorted by
  // relevance — take the top result if any.
  const searchUrl = new URL('https://lrclib.net/api/search');
  searchUrl.searchParams.set('track_name', track);
  searchUrl.searchParams.set('artist_name', artist);
  try {
    const r = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'EchoNest (https://echonest-app.vercel.app)',
      },
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const arr = (await r.json()) as LrclibResult[];
      const best = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      if (best) {
        return NextResponse.json({
          synced: best.syncedLyrics || null,
          plain: best.plainLyrics || null,
          source: 'lrclib',
        });
      }
    }
  } catch (e) {
    console.warn('lrclib fuzzy lookup failed:', e);
  }

  return NextResponse.json({ synced: null, plain: null, source: 'lrclib' });
}
