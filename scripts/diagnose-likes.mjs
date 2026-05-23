#!/usr/bin/env node
// Read-only diagnostic: report likes + "Liked Videos (YouTube)" playlist state.
// Usage: node --env-file=.env.local scripts/diagnose-likes.mjs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { data: signIn, error: authErr } = await supabase.auth.signInWithPassword({
  email: process.env.PUBLIC_USER_EMAIL,
  password: process.env.PUBLIC_USER_PASSWORD,
});
if (authErr) throw authErr;
const userId = signIn.user.id;
console.log('Signed in as user:', userId, `(${process.env.PUBLIC_USER_EMAIL})`);

// Likes, joined to song source/kind
const { data: likes } = await supabase
  .from('likes')
  .select('id, song:songs(source, youtube_kind)')
  .eq('user_id', userId);
let ytVid = 0, other = 0;
for (const r of likes || []) {
  const s = Array.isArray(r.song) ? r.song[0] : r.song;
  if (s?.source === 'youtube_embed' && s?.youtube_kind === 'video') ytVid++;
  else other++;
}
console.log(`\nLIKES: ${likes?.length ?? 0} total — ${ytVid} youtube-video, ${other} other/upload`);

// All "LL" playlists
const { data: lls } = await supabase
  .from('playlists')
  .select('id, title, created_at')
  .eq('user_id', userId)
  .eq('source_youtube_id', 'LL')
  .order('created_at', { ascending: true });
console.log(`\n"LL" PLAYLISTS: ${lls?.length ?? 0}`);
for (const p of lls || []) {
  const { count } = await supabase
    .from('playlist_songs')
    .select('*', { count: 'exact', head: true })
    .eq('playlist_id', p.id);
  console.log(`   ${p.id}  "${p.title}"  ${count ?? 0} songs  (created ${p.created_at})`);
}

// Any OTHER duplicate playlists by source id?
const { data: allYt } = await supabase
  .from('playlists')
  .select('source_youtube_id')
  .eq('user_id', userId)
  .not('source_youtube_id', 'is', null);
const counts = {};
for (const p of allYt || []) counts[p.source_youtube_id] = (counts[p.source_youtube_id] || 0) + 1;
const dups = Object.entries(counts).filter(([, n]) => n > 1);
console.log(`\nDUPLICATE source_youtube_id playlists: ${dups.length}`);
for (const [sid, n] of dups) console.log(`   ${sid} × ${n}`);
