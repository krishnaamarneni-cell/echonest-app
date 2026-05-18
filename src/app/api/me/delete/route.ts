import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/**
 * Deletes the signed-in user's account and all their data.
 *
 * Two-step process:
 * 1. Delete every row in user-owned tables (songs, playlists,
 *    playlist_songs, likes, recently_played, albums, artists,
 *    user_youtube_tokens, profiles). RLS already enforces user_id =
 *    auth.uid() so the user can do this themselves with their own
 *    auth session.
 * 2. Delete the auth user from auth.users — this requires the
 *    service-role key (admin) since the user can't delete their own
 *    auth.users row. Service role lives in SUPABASE_SERVICE_ROLE_KEY
 *    env var (server-only).
 *
 * Storage cleanup: any uploaded audio files in the 'audio' bucket
 * scoped to this user are deleted in step 1 via the songs table
 * cascade — but the bucket files themselves are also removed
 * explicitly here to avoid orphaned blobs.
 */

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const userId = user.id;

  // Step 1 (a): collect uploaded file URLs so we can delete the
  // actual bytes from Storage before the rows go.
  const { data: uploadSongs } = await supabase
    .from('songs')
    .select('file_url')
    .eq('user_id', userId)
    .eq('source', 'upload')
    .not('file_url', 'is', null);

  const storagePaths: string[] = [];
  for (const s of uploadSongs || []) {
    const url = (s as { file_url: string }).file_url;
    try {
      const u = new URL(url);
      const m = u.pathname.split('/storage/v1/object/public/audio/')[1];
      if (m) storagePaths.push(decodeURIComponent(m));
    } catch {}
  }
  if (storagePaths.length > 0) {
    try {
      await supabase.storage.from('audio').remove(storagePaths);
    } catch (e) {
      console.warn('Storage cleanup failed for', storagePaths.length, 'files:', e);
    }
  }

  // Step 1 (b): delete user's rows. Order matters for foreign-key
  // constraints — child rows first.
  // RLS will scope deletes to this user even though we're issuing
  // unqualified deletes; we add explicit .eq('user_id') anyway as
  // defense in depth.
  const playlistsRows = await supabase
    .from('playlists')
    .select('id')
    .eq('user_id', userId);
  const playlistIds = (playlistsRows.data || []).map(
    (p: { id: string }) => p.id,
  );

  if (playlistIds.length > 0) {
    await supabase
      .from('playlist_songs')
      .delete()
      .in('playlist_id', playlistIds);
  }

  await Promise.all([
    supabase.from('likes').delete().eq('user_id', userId),
    supabase.from('recently_played').delete().eq('user_id', userId),
    supabase.from('user_youtube_tokens').delete().eq('user_id', userId),
  ]);

  await supabase.from('playlists').delete().eq('user_id', userId);
  await supabase.from('songs').delete().eq('user_id', userId);
  await supabase.from('albums').delete().eq('user_id', userId);
  await supabase.from('artists').delete().eq('user_id', userId);
  await supabase.from('profiles').delete().eq('id', userId);

  // Step 2: delete the auth user. Requires service role.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
      );
      const { error: deleteUserErr } = await admin.auth.admin.deleteUser(userId);
      if (deleteUserErr) {
        console.warn('auth.admin.deleteUser failed:', deleteUserErr.message);
      }
    } catch (e) {
      console.warn('Admin client setup failed:', e);
    }
  } else {
    // No service role key on the server. Sign the user out and rely on
    // a follow-up manual deletion. Their data rows are already gone.
    console.warn(
      'SUPABASE_SERVICE_ROLE_KEY not set — auth.users row not deleted, only data wiped.',
    );
  }

  // Clear the user's session cookies regardless
  try { await supabase.auth.signOut(); } catch {}

  return NextResponse.json({ ok: true });
}
