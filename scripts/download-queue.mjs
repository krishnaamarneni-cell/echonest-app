#!/usr/bin/env node
// Process the EchoNest download queue.
//
// Finds every song with download_status='queued', downloads its YouTube
// audio via yt-dlp, uploads MP3 to Supabase Storage, sets file_url and
// status='done'.
//
// Usage:
//   npm run download-queue
//
// Skips podcasts entirely (they're meant to be streamed).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat, unlink, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const exec = promisify(execFile);

const YTDLP_DIR = 'C:/Users/Krishna/Downloads/yt-dlp';
const YTDLP_EXE = path.join(YTDLP_DIR, 'yt-dlp.exe');
const WORK_ROOT = path.join(YTDLP_DIR, 'echonest-queue');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.PUBLIC_USER_EMAIL;
const PASSWORD = process.env.PUBLIC_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PUBLIC_USER_EMAIL, PUBLIC_USER_PASSWORD in .env.local');
  process.exit(1);
}

async function downloadOne(song, supabase, userId) {
  const workDir = path.join(WORK_ROOT, song.id);
  await mkdir(workDir, { recursive: true });

  const url = `https://www.youtube.com/watch?v=${song.youtube_id}`;
  console.log(`\n→ [${song.id.slice(0, 8)}] ${song.title}`);
  console.log(`  Downloading ${url}...`);

  // Mark as downloading
  await supabase
    .from('songs')
    .update({ download_status: 'downloading', download_error: null })
    .eq('id', song.id);

  try {
    await exec(
      YTDLP_EXE,
      [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--ffmpeg-location', YTDLP_DIR,
        '-o', '%(id)s.%(ext)s',
        '-P', workDir,
        url,
      ],
      { maxBuffer: 1024 * 1024 * 20 },
    );

    const files = await readdir(workDir);
    const mp3 = files.find((f) => f.endsWith('.mp3'));
    if (!mp3) throw new Error('yt-dlp produced no MP3');

    const filePath = path.join(workDir, mp3);
    const fileBuf = await readFile(filePath);
    const sizeMB = (fileBuf.length / 1024 / 1024).toFixed(1);
    console.log(`  Got MP3 (${sizeMB} MB), uploading to Supabase Storage...`);

    const storagePath = `${userId}/${song.id}.mp3`;
    const { error: upErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, fileBuf, {
        contentType: 'audio/mpeg',
        upsert: true,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('audio')
      .getPublicUrl(storagePath);

    const { error: updErr } = await supabase
      .from('songs')
      .update({
        file_url: publicUrl,
        download_status: 'done',
        download_error: null,
      })
      .eq('id', song.id);
    if (updErr) throw new Error(`Update failed: ${updErr.message}`);

    console.log(`  ✓ Done`);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error(`  ✗ ${msg}`);
    await supabase
      .from('songs')
      .update({
        download_status: 'error',
        download_error: msg.slice(0, 500),
      })
      .eq('id', song.id);
  } finally {
    // Clean up working dir
    try { await rm(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('→ Signing in...');
  const { data: signIn, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authErr) throw authErr;
  const userId = signIn.user.id;

  // Pull queued songs. Skip podcasts — they're meant to stream.
  const { data: queued, error: qErr } = await supabase
    .from('songs')
    .select('id, title, youtube_id, content_type')
    .eq('download_status', 'queued')
    .neq('content_type', 'podcast')
    .not('youtube_id', 'is', null);
  if (qErr) throw qErr;

  if (!queued || queued.length === 0) {
    console.log('Nothing queued. (Songs marked "queued" in the website will appear here.)');
    return;
  }

  console.log(`→ ${queued.length} song${queued.length === 1 ? '' : 's'} queued`);
  await mkdir(WORK_ROOT, { recursive: true });

  for (const song of queued) {
    if (!song.youtube_id) {
      console.log(`Skip "${song.title}" — no youtube_id`);
      continue;
    }
    await downloadOne(song, supabase, userId);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal:', e?.message || e);
  process.exit(1);
});
