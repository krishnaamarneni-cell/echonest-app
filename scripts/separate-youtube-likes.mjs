#!/usr/bin/env node
// One-time migration: split already-imported YouTube "Liked Videos" out of
// EchoNest's Liked Songs and into a dedicated "Liked Videos (YouTube)"
// playlist — matching the new import behaviour.
//
// Before this change, connecting a YouTube account dumped the account's
// Liked Videos into the `likes` table alongside songs hearted inside the
// app, so they were clubbed together on the Liked Songs page. This moves
// every YouTube *video* like into the LL playlist and removes it from
// `likes`. Likes on uploaded songs (clearly in-app hearts) are left alone.
//
// NOTE: existing data can't distinguish an imported YT like from a YT video
// you hearted in-app — both look identical — so ALL youtube-video likes are
// moved. Re-heart any you want back in Liked Songs afterwards.
//
// Usage (PowerShell), from the echonest/ folder:
//   node --env-file=.env.local scripts/separate-youtube-likes.mjs           # dry run
//   node --env-file=.env.local scripts/separate-youtube-likes.mjs --commit  # apply

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.PUBLIC_USER_EMAIL;
const PASSWORD = process.env.PUBLIC_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !EMAIL || !PASSWORD) {
  console.error(
    'Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PUBLIC_USER_EMAIL, PUBLIC_USER_PASSWORD.',
  );
  process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('→ Signing in…');
  const { data: signIn, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authErr) throw authErr;
  const userId = signIn.user.id;

  // 1. All likes for this user, joined to the song so we can see source/kind.
  const { data: likeRows, error: likesErr } = await supabase
    .from('likes')
    .select('id, song_id, song:songs(id, title, source, youtube_kind)')
    .eq('user_id', userId);
  if (likesErr) throw likesErr;

  const yt = [];
  let uploadKept = 0;
  for (const r of likeRows || []) {
    const s = Array.isArray(r.song) ? r.song[0] : r.song;
    if (!s) continue;
    if (s.source === 'youtube_embed' && s.youtube_kind === 'video') {
      yt.push({ likeId: r.id, songId: s.id, title: s.title });
    } else {
      uploadKept += 1;
    }
  }

  console.log(`  Found ${likeRows?.length ?? 0} total likes.`);
  console.log(`  ${yt.length} are YouTube videos → move to "Liked Videos (YouTube)".`);
  console.log(`  ${uploadKept} are uploads/other → stay in Liked Songs.`);

  if (yt.length === 0) {
    console.log('Nothing to migrate. Done.');
    return;
  }

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing changed. Re-run with --commit to apply.');
    console.log('Sample of what would move:');
    for (const v of yt.slice(0, 10)) console.log(`   • ${v.title}`);
    if (yt.length > 10) console.log(`   …and ${yt.length - 10} more`);
    return;
  }

  // 2. Find-or-create the dedicated LL playlist.
  console.log('\n→ Ensuring "Liked Videos (YouTube)" playlist exists…');
  const { data: existingLL } = await supabase
    .from('playlists')
    .select('id')
    .eq('user_id', userId)
    .eq('source_youtube_id', 'LL')
    .maybeSingle();

  let llId;
  if (existingLL) {
    llId = existingLL.id;
    console.log('  Reusing existing playlist.');
  } else {
    const { data: created, error: plErr } = await supabase
      .from('playlists')
      .insert({
        user_id: userId,
        title: 'Liked Videos (YouTube)',
        description: 'Your liked videos, synced from YouTube',
        source_youtube_id: 'LL',
        last_synced_at: new Date().toISOString(),
        content_type: 'music',
        is_public: false,
      })
      .select('id')
      .single();
    if (plErr || !created) throw new Error(plErr?.message || 'Failed to create playlist');
    llId = created.id;
    console.log('  Created playlist.');
  }

  // 3. Skip songs already linked to the LL playlist.
  const { data: existingLinks } = await supabase
    .from('playlist_songs')
    .select('song_id')
    .eq('playlist_id', llId);
  const linked = new Set((existingLinks || []).map((r) => r.song_id));

  let pos = linked.size;
  const linkRows = [];
  for (const v of yt) {
    if (linked.has(v.songId)) continue;
    linked.add(v.songId);
    linkRows.push({ playlist_id: llId, song_id: v.songId, position: pos++ });
  }

  // 4. Link them to the playlist (batched).
  console.log(`→ Linking ${linkRows.length} song(s) to the playlist…`);
  for (let i = 0; i < linkRows.length; i += 100) {
    const batch = linkRows.slice(i, i + 100);
    const { error } = await supabase.from('playlist_songs').insert(batch);
    if (error) throw error;
  }

  // 5. Remove those likes from the Liked Songs collection (batched).
  console.log(`→ Removing ${yt.length} YouTube like(s) from Liked Songs…`);
  const likeIds = yt.map((v) => v.likeId);
  for (let i = 0; i < likeIds.length; i += 200) {
    const batch = likeIds.slice(i, i + 200);
    const { error } = await supabase.from('likes').delete().in('id', batch);
    if (error) throw error;
  }

  console.log('\n✅ Done.');
  console.log(`   Liked Videos (YouTube): +${linkRows.length} linked (others already present).`);
  console.log(`   Liked Songs now holds your ${uploadKept} in-app heart(s).`);
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
