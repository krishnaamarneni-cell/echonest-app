#!/usr/bin/env node
// Download a YouTube video as MP3 (via local yt-dlp) and upload it to
// EchoNest's Supabase backend so it shows up in /downloads instantly.
//
// Usage (PowerShell):
//   node --env-file=.env.local scripts/yt-to-echonest.mjs "https://youtube.com/..."
//
// Setup (one time): add these two lines to echonest/.env.local
//   PUBLIC_USER_EMAIL=avgk26@gmail.com
//   PUBLIC_USER_PASSWORD=...
// (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are already there)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const exec = promisify(execFile);

const YTDLP_DIR = 'C:/Users/Krishna/Downloads/yt-dlp';
const YTDLP_EXE = path.join(YTDLP_DIR, 'yt-dlp.exe');
const WORK_DIR = path.join(YTDLP_DIR, 'echonest-work');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.PUBLIC_USER_EMAIL;
const PASSWORD = process.env.PUBLIC_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !EMAIL || !PASSWORD) {
  console.error(
    'Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PUBLIC_USER_EMAIL, PUBLIC_USER_PASSWORD in scripts/.env',
  );
  process.exit(1);
}

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/yt-to-echonest.mjs "<youtube-url>"');
  process.exit(1);
}

async function downloadMp3(youtubeUrl) {
  await mkdir(WORK_DIR, { recursive: true });
  console.log('→ Downloading & converting to MP3 via yt-dlp...');
  // Print metadata as JSON on a separate line so we can pick title/artist/thumb
  await exec(
    YTDLP_EXE,
    [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--ffmpeg-location', YTDLP_DIR,
      '--write-info-json',
      '--no-write-thumbnail',
      '-o', '%(title)s.%(ext)s',
      '-P', WORK_DIR,
      youtubeUrl,
    ],
    { maxBuffer: 1024 * 1024 * 20 },
  );

  const files = await readdir(WORK_DIR);
  const mp3 = files.find((f) => f.endsWith('.mp3'));
  const info = files.find((f) => f.endsWith('.info.json'));
  if (!mp3 || !info) throw new Error('yt-dlp did not produce expected files');

  const meta = JSON.parse(
    await readFile(path.join(WORK_DIR, info), 'utf8'),
  );

  return {
    filePath: path.join(WORK_DIR, mp3),
    title: meta.title || mp3.replace(/\.mp3$/i, ''),
    artist: meta.channel || meta.uploader || 'Unknown',
    thumbnail: meta.thumbnail || null,
    duration: Math.round(meta.duration || 0),
    youtubeId: meta.id || null,
    infoPath: path.join(WORK_DIR, info),
  };
}

async function main() {
  const { filePath, title, artist, thumbnail, duration, youtubeId, infoPath } =
    await downloadMp3(url);
  const fileSize = (await stat(filePath)).size;
  console.log(`  ${title} — ${artist} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('→ Signing in to EchoNest...');
  const { data: signIn, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authErr) throw authErr;
  const userId = signIn.user.id;

  // Upload MP3 to Storage
  console.log('→ Uploading to Supabase Storage...');
  const ext = 'mp3';
  const storagePath = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const fileBuf = await readFile(filePath);
  const { error: upErr } = await supabase.storage
    .from('audio')
    .upload(storagePath, fileBuf, { contentType: 'audio/mpeg', upsert: false });
  if (upErr) throw upErr;
  const { data: { publicUrl } } = supabase.storage
    .from('audio')
    .getPublicUrl(storagePath);

  // Insert song row — link YouTube id too so it's a single "track" with both sources
  console.log('→ Creating song row...');
  const { data: song, error: insertErr } = await supabase
    .from('songs')
    .insert({
      user_id: userId,
      title,
      artist_name: artist,
      cover_url: thumbnail,
      file_url: publicUrl,
      duration,
      source: 'upload',
      youtube_id: youtubeId,
      youtube_kind: youtubeId ? 'video' : null,
      content_type: 'music',
    })
    .select('id')
    .single();
  if (insertErr) throw insertErr;

  console.log(`✓ Added: "${title}" by ${artist}`);
  console.log(`  Song id: ${song.id}`);
  console.log(`  Now visible at: ${SUPABASE_URL.replace(/\/?$/, '')} → EchoNest /downloads`);

  // Cleanup workspace files (keep the MP3 in case user wants it)
  try { await unlink(infoPath); } catch {}
}

main().catch((e) => {
  console.error('✗ Failed:', e.message || e);
  process.exit(1);
});
