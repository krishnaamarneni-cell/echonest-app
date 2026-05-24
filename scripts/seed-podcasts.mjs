#!/usr/bin/env node
// Add more PODCAST episodes from well-known shows. Additive; dedupes by
// youtube_id so re-running won't create duplicates.
// Usage: node --env-file=.env.local scripts/seed-podcasts.mjs

import { createClient } from '@supabase/supabase-js';

const TUNNEL = 'https://recipe-popular-hand-incentive.trycloudflare.com';
const SECRET = 'echonest-bg-K7r2v9XmQ3pL8nT4wY6jH1sD5aF0gB';
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { data: signIn, error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.PUBLIC_USER_EMAIL,
  password: process.env.PUBLIC_USER_PASSWORD,
});
if (authErr) throw authErr;
const uid = signIn.user.id;
console.log('Signed in as', process.env.PUBLIC_USER_EMAIL, '\n');

// Which podcasters to feature. Each query returns the top matching episode.
const queries = [
  'The Diary Of A CEO full episode',
  'The Diary Of A CEO Steven Bartlett full episode',
  'Lex Fridman Podcast full episode',
  'Joe Rogan Experience full episode',
  'Huberman Lab podcast full episode',
  'The Tim Ferriss Show full episode',
  'Modern Wisdom Chris Williamson full episode',
  'TED Talks Daily podcast',
];

async function searchTop(q) {
  try {
    const r = await fetch(`${TUNNEL}/search?q=${encodeURIComponent(q)}&s=${SECRET}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.videos || []).find((v) => v.videoId) || null;
  } catch { return null; }
}

// Existing youtube_ids so we don't double-add.
const { data: existing } = await sb
  .from('songs')
  .select('youtube_id')
  .eq('user_id', uid)
  .eq('content_type', 'podcast');
const have = new Set((existing || []).map((r) => r.youtube_id));

console.log('Adding podcasts:');
let added = 0;
for (const q of queries) {
  const v = await searchTop(q);
  if (!v) { console.log(`  x no result for "${q}"`); continue; }
  if (have.has(v.videoId)) { console.log(`  = already have: ${v.title}`); continue; }
  have.add(v.videoId);
  const { error } = await sb.from('songs').insert({
    user_id: uid,
    title: v.title,
    artist_name: v.channel || 'Podcast',
    duration: 0,
    file_url: '',
    cover_url: v.thumbnail || thumb(v.videoId),
    source: 'youtube_embed',
    youtube_id: v.videoId,
    youtube_kind: 'video',
    content_type: 'podcast',
  });
  if (error) { console.log(`  x ${v.title}: ${error.message}`); continue; }
  console.log(`  + ${v.channel} — ${v.title}`);
  added++;
}

console.log(`\nDone. Added ${added} podcast episode(s).`);
