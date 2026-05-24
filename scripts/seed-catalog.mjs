#!/usr/bin/env node
// Seed a richer, properly-linked music catalog: artists (with their songs
// linked), albums (with tracks), songs, and themed playlists. Additive +
// idempotent — dedupes artists/albums/playlists by name and songs by
// youtube_id, so re-running won't create duplicates.
// Usage: node --env-file=.env.local scripts/seed-catalog.mjs

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

async function searchTop(q) {
  try {
    const r = await fetch(`${TUNNEL}/search?q=${encodeURIComponent(q)}&s=${SECRET}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.videos || []).find((v) => v.videoId) || null;
  } catch { return null; }
}

// Existing music youtube_ids to dedupe songs.
const { data: existingSongs } = await sb
  .from('songs').select('id, youtube_id').eq('user_id', uid);
const songIdByVideo = new Map((existingSongs || []).filter((s) => s.youtube_id).map((s) => [s.youtube_id, s.id]));

async function findOrCreateArtist(name, image) {
  const { data: ex } = await sb.from('artists').select('id').eq('user_id', uid).eq('name', name).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await sb.from('artists').insert({ user_id: uid, name, image_url: image }).select('id').single();
  if (error) { console.log(`  x artist ${name}: ${error.message}`); return null; }
  return data.id;
}

async function findOrCreateAlbum(title, artistName, artistId, cover, year) {
  const { data: ex } = await sb.from('albums').select('id').eq('user_id', uid).eq('title', title).eq('artist_name', artistName).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await sb.from('albums').insert({ user_id: uid, title, artist_name: artistName, artist_id: artistId, cover_url: cover, year }).select('id').single();
  if (error) { console.log(`  x album ${title}: ${error.message}`); return null; }
  return data.id;
}

// Curated catalog. Each track is resolved via search so the video is real.
const catalog = [
  { artist: 'The Weeknd', album: 'After Hours', year: 2020, songs: ['Blinding Lights', 'Save Your Tears', 'In Your Eyes'] },
  { artist: 'Dua Lipa', album: 'Future Nostalgia', year: 2020, songs: ['Levitating', "Don't Start Now", 'Physical'] },
  { artist: 'Ed Sheeran', album: 'Divide', year: 2017, songs: ['Shape of You', 'Perfect', 'Castle on the Hill'] },
  { artist: 'Imagine Dragons', album: 'Evolve', year: 2017, songs: ['Believer', 'Thunder', 'Whatever It Takes'] },
  { artist: 'Coldplay', album: 'A Head Full of Dreams', year: 2015, songs: ['Hymn for the Weekend', 'Adventure of a Lifetime'] },
];

const pool = []; // {id, title} for playlist building

for (const entry of catalog) {
  console.log(`${entry.artist}:`);
  const resolved = []; // {videoId, title, channel, thumbnail}
  for (const title of entry.songs) {
    const v = await searchTop(`${entry.artist} ${title}`);
    if (v) resolved.push(v);
    else console.log(`  x no result: ${title}`);
  }
  if (resolved.length === 0) continue;

  const artistId = await findOrCreateArtist(entry.artist, resolved[0].thumbnail || thumb(resolved[0].videoId));
  const albumId = await findOrCreateAlbum(entry.album, entry.artist, artistId, resolved[0].thumbnail || thumb(resolved[0].videoId), entry.year);

  for (const v of resolved) {
    let songId = songIdByVideo.get(v.videoId);
    if (songId) {
      // Already exists — just link it to this artist/album.
      await sb.from('songs').update({ artist_id: artistId, album_id: albumId, album_name: entry.album, artist_name: entry.artist }).eq('id', songId);
      console.log(`  = linked existing: ${v.title}`);
    } else {
      const { data, error } = await sb.from('songs').insert({
        user_id: uid, title: v.title, artist_name: entry.artist, album_name: entry.album,
        artist_id: artistId, album_id: albumId, duration: 0, file_url: '',
        cover_url: v.thumbnail || thumb(v.videoId), source: 'youtube_embed',
        youtube_id: v.videoId, youtube_kind: 'video', content_type: 'music',
      }).select('id').single();
      if (error) { console.log(`  x ${v.title}: ${error.message}`); continue; }
      songId = data.id;
      songIdByVideo.set(v.videoId, songId);
      console.log(`  + ${v.title}`);
    }
    pool.push({ id: songId, title: v.title });
  }
}

// Themed playlists (dedupe by title).
async function makePlaylist(title, description, songIds, cover) {
  const { data: ex } = await sb.from('playlists').select('id').eq('user_id', uid).eq('title', title).maybeSingle();
  if (ex) { console.log(`  = playlist exists: ${title}`); return; }
  const { data: pl, error } = await sb.from('playlists').insert({
    user_id: uid, title, description, is_public: true, content_type: 'music', cover_url: cover,
  }).select('id').single();
  if (error || !pl) { console.log(`  x playlist ${title}: ${error?.message}`); return; }
  const links = songIds.map((sid, i) => ({ playlist_id: pl.id, song_id: sid, position: i }));
  if (links.length) await sb.from('playlist_songs').insert(links);
  console.log(`  + ${title} (${links.length} songs)`);
}

console.log('\nPlaylists:');
const ids = pool.map((p) => p.id);
const cover = pool[0] ? undefined : undefined;
await makePlaylist('Top Hits', 'The biggest tracks right now', ids.slice(0, 8), cover);
await makePlaylist('Pop Anthems', 'Sing-along pop favourites', ids.slice(0, 6), cover);
await makePlaylist('Feel Good', 'Upbeat songs to lift the mood', ids.slice(4), cover);

console.log('\nDone.');
