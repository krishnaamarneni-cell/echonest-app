import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Personal YouTube audio extractor with range-request support.
// iOS Safari needs HTTP range requests for <audio> playback, so we:
//   1. Ask yt-dlp for the direct CDN audio URL (not the bytes)
//   2. Proxy that URL with proper Range / Content-Range forwarding
// Result: Safari sees a normal seekable audio source over HTTPS and plays it
// like any uploaded MP3, including in background and on locked screen.

const exec = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.SHARED_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!SHARED_SECRET) {
  console.error('FATAL: SHARED_SECRET env var is required');
  process.exit(1);
}

// Tiny in-memory cache: videoId -> { url, expiresAt }. yt-dlp resolution is
// the slow part (~1-2s); cache it for 5 minutes so repeat plays are instant.
const urlCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-length, content-range, accept-ranges');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

async function resolveAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { stdout } = await exec('yt-dlp', [
    '-f', '140',           // m4a / AAC 128kbps — Safari plays natively
    '--no-playlist',
    '--no-warnings',
    '-g',                   // print the direct URL, don't download
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { timeout: 30000, maxBuffer: 1024 * 1024 });

  const url = stdout.trim().split('\n').filter(Boolean)[0];
  if (!url) throw new Error('yt-dlp returned no URL');

  urlCache.set(videoId, { url, expiresAt: Date.now() + CACHE_TTL_MS });
  return url;
}

app.get('/audio/:videoId', async (req, res) => {
  const { videoId } = req.params;

  // Auth — Bearer header OR ?s=SECRET query param. HTML5 <audio> can't set
  // custom headers, so the query form covers that case.
  const auth = req.headers.authorization || '';
  const secret = req.query.s || '';
  const ok = auth === `Bearer ${SHARED_SECRET}` || secret === SHARED_SECRET;
  if (!ok) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  let audioUrl;
  try {
    audioUrl = await resolveAudioUrl(videoId);
  } catch (e) {
    console.error('resolveAudioUrl failed:', e?.message || e);
    return res.status(502).json({ error: 'Could not resolve audio URL', detail: String(e?.message || e).slice(0, 200) });
  }

  // Forward the Range header from the browser so seeking + iOS work.
  const upstreamHeaders = {};
  if (req.headers.range) upstreamHeaders.range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(audioUrl, { headers: upstreamHeaders });
  } catch (e) {
    console.error('upstream fetch failed:', e?.message || e);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }

  // Pass through status (200 / 206) and relevant headers
  res.status(upstream.status);
  const passHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag',
  ];
  for (const h of passHeaders) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  // Ensure Safari knows it can seek
  if (!upstream.headers.get('accept-ranges')) {
    res.setHeader('Accept-Ranges', 'bytes');
  }
  // Default content-type if upstream didn't say
  if (!upstream.headers.get('content-type')) {
    res.setHeader('Content-Type', 'audio/mp4');
  }

  if (!upstream.body) {
    return res.end();
  }

  // Node 20+ supports converting WHATWG ReadableStream to Node Readable
  const reader = upstream.body.getReader();
  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((r) => res.once('drain', r));
        }
      }
      res.end();
    } catch (e) {
      console.error('pump error:', e?.message || e);
      if (!res.writableEnded) res.end();
    }
  };
  req.on('close', () => {
    try { reader.cancel(); } catch {}
  });
  pump();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`yt-proxy listening on :${PORT}`);
});
