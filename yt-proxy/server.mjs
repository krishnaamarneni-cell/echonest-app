import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Personal YouTube audio extractor with range-request support.
// iOS Safari needs HTTP range requests for <audio> playback, so we:
//   1. Ask yt-dlp for the direct CDN audio URL (not the bytes)
//   2. Proxy that URL with proper Range / Content-Range forwarding
// Result: Safari sees a normal seekable audio source over HTTPS and plays it
// like any uploaded MP3, including in background and on locked screen.

// Prevent the whole service from dying when one upstream stream blows up
// (ECONNRESET from googlevideo, broken iPhone connection, etc.)
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err instanceof Error ? err.message : err);
});

const exec = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.SHARED_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
// Allow override for Windows / non-PATH installs. On Linux/Docker the
// defaults work because the binaries are in PATH.
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

if (!SHARED_SECRET) {
  console.error('FATAL: SHARED_SECRET env var is required');
  process.exit(1);
}

// In-memory cache: videoId -> { url, expiresAt }. yt-dlp resolution is the
// slow part (1-2s per cold call). YouTube's signed audio URLs typically
// expire after ~6 hours, so 4 hours is a safe re-use window. Within a
// session, repeat plays and listen-along catch-up are instant.
const urlCache = new Map();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

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

// Search YouTube via yt-dlp (no API key required).
// Returns up to 12 results matching the query.
app.get('/search', async (req, res) => {
  const auth = req.headers.authorization || '';
  const secret = req.query.s || '';
  const ok = auth === `Bearer ${SHARED_SECRET}` || secret === SHARED_SECRET;
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });

  const q = (req.query.q || '').toString().trim().slice(0, 200);
  if (!q) return res.json({ videos: [] });

  try {
    const { stdout } = await exec(
      YTDLP_PATH,
      [
        `ytsearch12:${q}`,
        '--flat-playlist',
        '--dump-single-json',
        '--no-warnings',
        '--skip-download',
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 * 4 },
    );

    const data = JSON.parse(stdout);
    const entries = data?.entries || [];

    const videos = entries
      .filter((e) => e?.id)
      .map((e) => {
        const videoId = e.id;
        const thumb =
          e.thumbnails?.find((t) => t.url)?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
          videoId,
          title: e.title || 'Untitled',
          channel: e.channel || e.uploader || 'YouTube',
          thumbnail: thumb,
        };
      });

    return res.json({ videos });
  } catch (e) {
    return res.status(502).json({
      error: e?.message || String(e),
    });
  }
});

// Pull YouTube's "Mix / Radio" — the algorithm-generated autoplay queue
// you see when you click a song on youtube.com. yt-dlp extracts the
// playlist with id `RD<videoId>` which is literally the same list YouTube
// would feed you on autoplay. We return up to 20 items; the AudioPlayer
// can append a subset to the queue as the user listens.
app.get('/recommend/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const auth = req.headers.authorization || '';
  const secret = req.query.s || '';
  const ok = auth === `Bearer ${SHARED_SECRET}` || secret === SHARED_SECRET;
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  try {
    const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
    const { stdout } = await exec(
      YTDLP_PATH,
      [
        mixUrl,
        '--flat-playlist',
        '--dump-single-json',
        '--no-warnings',
        '--skip-download',
        '--playlist-end', '25',
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 * 4 },
    );

    const data = JSON.parse(stdout);
    const entries = data?.entries || [];

    const items = entries
      .filter((e) => e?.id && e.id !== videoId)
      .slice(0, 20)
      .map((e) => ({
        videoId: e.id,
        title: e.title || 'Untitled',
        channel: e.channel || e.uploader || 'YouTube',
        thumbnail:
          e.thumbnails?.find?.((t) => t.url)?.url ||
          `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      }));

    return res.json({ items });
  } catch (e) {
    console.error('recommend failed:', e?.message || e);
    return res.status(502).json({ error: e?.message || String(e) });
  }
});

async function resolveAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { stdout } = await exec(YTDLP_PATH, [
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

// ---------------------------------------------------------------------------
// Chunked upstream streaming.
//
// googlevideo paces a single open-ended stream to roughly playback rate
// (measured ~22 KB/s through the tunnel), but serves *bounded* Range
// requests at full speed (~124 KB/s on the same file — about 5x). The
// <audio> element asks for the whole file in one open-ended request, so it
// gets the slow path, which is why a new song took forever to start on a
// phone.
//
// So for whole-file requests we stop being a dumb pipe: fetch bounded 1 MB
// chunks ourselves, keep a few in flight, and write them out in order. The
// client sees one normal response; it just fills ~5x faster.
//
// READAHEAD is 3 because aggregate throughput is capped by this laptop's
// upstream, not by YouTube's per-stream throttle. Measured on 2.42 MB:
// 1 -> 122 KB/s, 3 -> 124 KB/s, 6 -> ~85 KB/s with each request held open
// ~7x longer (and Cloudflare kills a tunnel response at ~100s).
const STREAM_CHUNK = 1024 * 1024;
const STREAM_READAHEAD = 3;

// Probe for total size + content-type. Cheap: one byte of body.
async function probeUpstream(url) {
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-0' } });
    try { await r.arrayBuffer(); } catch {}
    if (!r.ok && r.status !== 206) return null;
    const cr = r.headers.get('content-range') || '';
    const total = Number((cr.split('/')[1] || '').trim());
    if (!Number.isFinite(total) || total <= 0) return null;
    return { total, contentType: r.headers.get('content-type') || 'audio/mp4' };
  } catch {
    return null;
  }
}

// Never rejects — returns null on failure so a queued chunk can't become an
// unhandled rejection while we're awaiting an earlier one.
async function fetchChunk(url, start, end) {
  try {
    const r = await fetch(url, { headers: { range: `bytes=${start}-${end}` } });
    if (!r.ok && r.status !== 206) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

// Returns false if nothing was written yet (caller can fall back to the
// plain pipe), true if we owned the response.
async function streamChunked(url, start, res, req, tag, isRangeRequest) {
  const info = await probeUpstream(url);
  if (!info || start >= info.total) return false;
  const { total, contentType } = info;
  const end = total - 1;

  let aborted = false;
  req.on('close', () => { aborted = true; });

  let next = start;
  const inflight = [];
  const schedule = () => {
    while (inflight.length < STREAM_READAHEAD && next <= end) {
      const s = next;
      const e = Math.min(s + STREAM_CHUNK - 1, end);
      next = e + 1;
      inflight.push(fetchChunk(url, s, e));
    }
  };

  schedule();
  const first = await inflight.shift();
  if (!first) return false; // headers not sent — safe to fall back

  res.status(isRangeRequest ? 206 : 200);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(total - start));
  if (isRangeRequest) {
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  }

  const write = async (buf) => {
    if (!res.write(buf)) await new Promise((r) => res.once('drain', r));
  };

  try {
    await write(first);
    schedule();
    while (inflight.length) {
      const buf = await inflight.shift();
      if (aborted || res.destroyed) return true;
      if (!buf) throw new Error('chunk fetch failed');
      await write(buf);
      schedule();
    }
    if (!res.writableEnded) res.end();
    console.log(`${tag} chunked stream complete (${total - start} bytes)`);
  } catch (e) {
    console.error(`${tag} chunked stream aborted:`, e?.message || e);
    if (!res.writableEnded) res.destroy();
  }
  return true;
}

app.get('/audio/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const t0 = Date.now();
  const tag = `[audio ${videoId} ${req.method}]`;
  console.log(`${tag} enter`);

  // Auth — Bearer header OR ?s=SECRET query param. HTML5 <audio> can't set
  // custom headers, so the query form covers that case.
  const auth = req.headers.authorization || '';
  const secret = req.query.s || '';
  const ok = auth === `Bearer ${SHARED_SECRET}` || secret === SHARED_SECRET;
  if (!ok) {
    console.log(`${tag} unauthorized`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    console.log(`${tag} bad videoId`);
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  let audioUrl;
  try {
    audioUrl = await resolveAudioUrl(videoId);
    console.log(`${tag} resolved in ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`${tag} resolveAudioUrl failed:`, e?.message || e);
    return res.status(502).json({ error: 'Could not resolve audio URL', detail: String(e?.message || e).slice(0, 200) });
  }

  // Direct mode: 302 the client to googlevideo.com so bytes flow directly
  // from Google's CDN to the user's device — bypassing the slow tunnel.
  // googlevideo URLs aren't strictly IP-bound: they redirect again with
  // `ipbypass=yes` to grant access to the calling IP. <audio> follows the
  // chain transparently.
  if (req.query.direct === '1') {
    console.log(`${tag} 302 direct to googlevideo`);
    return res.redirect(302, audioUrl);
  }

  // HEAD is a metadata probe — the client discards the body. The old path
  // still fetched and drained the whole file to answer one (measured 160s
  // against the live service for a 2.4 MB song), which is both pointless
  // and long enough for Cloudflare to kill the tunnel response at ~100s.
  // Answer it from a 1-byte range probe instead.
  if (req.method === 'HEAD') {
    const info = await probeUpstream(audioUrl);
    if (info) {
      res.status(200);
      res.setHeader('Content-Type', info.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(info.total));
      console.log(`${tag} HEAD answered from probe (${info.total} bytes)`);
      return res.end();
    }
    console.log(`${tag} HEAD probe failed — falling back to plain pipe`);
  }

  // A *bounded* range (the downloader's "bytes=0-1048575") already comes
  // back at full speed, so pass those straight through. An absent or
  // open-ended range is <audio> asking for the whole file — the case
  // googlevideo throttles — so serve it with internal parallel ranges.
  const rangeHeader = (req.headers.range || '').trim();
  const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  const openEnded = !rangeHeader || (rangeMatch && rangeMatch[2] === '');
  if (req.method === 'GET' && openEnded) {
    const startByte = rangeMatch && rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const handled = await streamChunked(
      audioUrl, startByte, res, req, tag, !!rangeHeader,
    );
    if (handled) return;
    console.log(`${tag} chunked path unavailable — falling back to plain pipe`);
  }

  // Forward the Range header from the browser so seeking + iOS work.
  const upstreamHeaders = {};
  if (req.headers.range) upstreamHeaders.range = req.headers.range;

  // Hard timeout on the upstream fetch — googlevideo CDN edges sometimes
  // hang indefinitely instead of returning an error, which would otherwise
  // pin the request open forever and exhaust connections.
  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), 15000);
  let upstream;
  try {
    upstream = await fetch(audioUrl, { headers: upstreamHeaders, signal: ctrl.signal });
    console.log(`${tag} upstream status=${upstream.status} after ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`${tag} upstream fetch failed after ${Date.now() - t0}ms:`, e?.message || e);
    clearTimeout(abortTimer);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
  clearTimeout(abortTimer);

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
