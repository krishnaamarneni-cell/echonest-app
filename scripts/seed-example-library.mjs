#!/usr/bin/env node
// Seed a small EXAMPLE library so every tab has content (songs, podcasts,
// artists, album, playlist). Additive only — inserts rows, deletes nothing.
// Usage: node --env-file=.env.local scripts/seed-example-library.mjs

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
console.log('Signed in as', process.env.PUBLIC_USER_EMAIL, uid, '\n');

async function insertSong({ title, artist, videoId, contentType }) {
  const { data, error } = await sb
    .from('songs')
    .insert({
      user_id: uid,
      title,
      artist_name: artist,
      duration: 0,
      file_url: '',
      cover_url: thumb(videoId),
      source: 'youtube_embed',
      youtube_id: videoId,
      youtube_kind: 'video',
      content_type: contentType,
    })
    .select('id')
    .single();
  if (error) { console.log(`  x ${title}: ${error.message}`); return null; }
  console.log(`  + [${contentType}] ${title} — ${artist}`);
  return data.id;
}

// Stable, long-standing official music videos.
const music = [
  { title: 'Blinding Lights', artist: 'The Weeknd', videoId: '4NRXx6U8ABQ' },
  { title: 'Shape of You', artist: 'Ed Sheeran', videoId: 'JGwWNGJdvx8' },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', videoId: 'OPf0YbXqDm0' },
  { title: 'Despacito', artist: 'Luis Fonsi ft. Daddy Yankee', videoId: 'kJQP7kiw5Fk' },
];

console.log('Songs:');
const musicIds = [];
for (const m of music) {
  const id = await insertSong({ ...m, contentType: 'music' });
  if (id) musicIds.push(id);
}

// Podcasts: search via the proxy so the episodes are real + current.
async function searchTop(q) {
  try {
    const r = await fetch(`${TUNNEL}/search?q=${encodeURIComponent(q)}&s=${SECRET}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.videos || []).find((v) => v.videoId) || null;
  } catch { return null; }
}

console.log('\nPodcasts:');
for (const q of ['Lex Fridman Podcast full episode', 'The Diary of a CEO full episode']) {
  const v = await searchTop(q);
  if (v) {
    await insertSong({ title: v.title, artist: v.channel || 'Podcast', videoId: v.videoId, contentType: 'podcast' });
  } else {
    console.log(`  x no search result for "${q}" (proxy/tunnel may be down)`);
  }
}

// Artists
console.log('\nArtists:');
for (const a of [
  { name: 'The Weeknd', image_url: thumb('4NRXx6U8ABQ') },
  { name: 'Ed Sheeran', image_url: thumb('JGwWNGJdvx8') },
]) {
  const { error } = await sb.from('artists').insert({ user_id: uid, name: a.name, image_url: a.image_url });
  console.log(error ? `  x ${a.name}: ${error.message}` : `  + ${a.name}`);
}

// Album
console.log('\nAlbum:');
{
  const { error } = await sb.from('albums').insert({
    user_id: uid, title: 'After Hours', artist_name: 'The Weeknd', cover_url: thumb('4NRXx6U8ABQ'), year: 2020,
  });
  console.log(error ? `  x After Hours: ${error.message}` : '  + After Hours — The Weeknd');
}

// Playlist with the music songs
console.log('\nPlaylist:');
{
  const { data: pl, error } = await sb.from('playlists').insert({
    user_id: uid, title: 'Chill Hits', description: 'A few popular tracks to get started', is_public: true, content_type: 'music',
    cover_url: thumb('4NRXx6U8ABQ'),
  }).select('id').single();
  if (error || !pl) {
    console.log(`  x Chill Hits: ${error?.message}`);
  } else {
    const links = musicIds.map((sid, i) => ({ playlist_id: pl.id, song_id: sid, position: i }));
    if (links.length) {
      const { error: lerr } = await sb.from('playlist_songs').insert(links);
      console.log(lerr ? `  x links: ${lerr.message}` : `  + Chill Hits (${links.length} songs)`);
    }
  }
}

console.log('\nDone.');
