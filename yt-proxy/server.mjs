import express from 'express';
import { spawn } from 'node:child_process';

// Personal YouTube audio extractor.
// One job: given a video ID, stream the audio bytes back so a browser
// `<audio>` element on EchoNest can play it like a normal MP3 file.
// Safari then handles background playback the same as any HTML5 audio.

const app = express();
const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.SHARED_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!SHARED_SECRET) {
  console.error('FATAL: SHARED_SECRET env var is required');
  process.exit(1);
}

// CORS — only the EchoNest origin can call us
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-length, content-range');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/audio/:videoId', (req, res) => {
  const { videoId } = req.params;

  // Auth — shared secret in Authorization header
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${SHARED_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate video id
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  // m4a (AAC 128kbps) — works natively in Safari/iOS, no transcoding needed
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const ytdlp = spawn('yt-dlp', [
    '-f', '140',
    '--no-playlist',
    '--no-warnings',
    '-o', '-',
    url,
  ]);

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  ytdlp.stdout.pipe(res);

  let errBuf = '';
  ytdlp.stderr.on('data', (chunk) => { errBuf += chunk.toString(); });

  ytdlp.on('error', (err) => {
    console.error('spawn error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  ytdlp.on('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(502).json({ error: 'yt-dlp failed', code, stderr: errBuf.slice(0, 400) });
    }
  });

  // Client disconnected — kill yt-dlp
  req.on('close', () => {
    if (!ytdlp.killed) ytdlp.kill('SIGKILL');
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`yt-proxy listening on :${PORT}`);
});
