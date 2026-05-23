#!/usr/bin/env node
// Read-only: snapshot of the account's data so we can see what's actually there.
// Usage: node --env-file=.env.local scripts/diagnose-state.mjs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { data: signIn, error } = await supabase.auth.signInWithPassword({
  email: process.env.PUBLIC_USER_EMAIL,
  password: process.env.PUBLIC_USER_PASSWORD,
});
if (error) throw error;
const uid = signIn.user.id;
console.log('Account:', process.env.PUBLIC_USER_EMAIL, uid);

async function count(table, filters = (q) => q) {
  const { count } = await filters(
    supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', uid),
  );
  return count ?? 0;
}

console.log('\n== SONGS ==');
console.log('  total          :', await count('songs'));
console.log('  uploads        :', await count('songs', (q) => q.eq('source', 'upload')));
console.log('  youtube_embed  :', await count('songs', (q) => q.eq('source', 'youtube_embed')));

console.log('\n== OTHER ==');
console.log('  likes          :', await count('likes'));
console.log('  recently_played:', await count('recently_played'));
console.log('  playlists      :', await count('playlists'));
console.log('  yt playlists   :', await count('playlists', (q) => q.not('source_youtube_id', 'is', null)));

console.log('\n== PLAYLISTS (with song counts) ==');
const { data: pls } = await supabase
  .from('playlists')
  .select('id, title, source_youtube_id, created_at')
  .eq('user_id', uid)
  .order('created_at', { ascending: true });
for (const p of pls || []) {
  const { count: n } = await supabase
    .from('playlist_songs')
    .select('*', { count: 'exact', head: true })
    .eq('playlist_id', p.id);
  console.log(`   ${n ?? 0} songs  ${p.source_youtube_id ? '[YT '+p.source_youtube_id.slice(0,6)+']' : '[own]'}  "${p.title}"`);
}
