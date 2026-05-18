import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Returns the signed-in user's full library as a single JSON blob.
 *
 * What's included:
 *   - profile (id, email, display_name, avatar_url, created_at)
 *   - songs (every row scoped to user_id)
 *   - playlists + their items
 *   - likes
 *   - recently_played (last 1000)
 *   - albums, artists
 *   - youtube import tokens (refresh token IS included since it's
 *     the user's data — they granted it)
 *
 * Streams nothing — we serialize the whole thing and ship it as a
 * download attachment. Should be well under 10MB for any realistic
 * personal library.
 */

export async function GET() {
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

  // Each query is RLS-scoped to the calling user automatically
  const [
    profileRes,
    songsRes,
    playlistsRes,
    playlistSongsRes,
    likesRes,
    recentRes,
    albumsRes,
    artistsRes,
    ytTokensRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('songs').select('*').eq('user_id', user.id),
    supabase.from('playlists').select('*').eq('user_id', user.id),
    supabase
      .from('playlist_songs')
      .select('playlist_id, song_id, position, added_at')
      .in(
        'playlist_id',
        // We'll filter on the client side instead — fetch all and trust RLS
        // to scope. To avoid a subquery, do a second pass below.
        [],
      ),
    supabase.from('likes').select('*').eq('user_id', user.id),
    supabase
      .from('recently_played')
      .select('*')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(1000),
    supabase.from('albums').select('*').eq('user_id', user.id),
    supabase.from('artists').select('*').eq('user_id', user.id),
    supabase
      .from('user_youtube_tokens')
      .select('expires_at, scopes, last_synced_at, auto_sync_enabled, updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  // Now fetch playlist_songs for the user's playlists
  let playlistSongs: unknown[] = [];
  const playlistIds = (playlistsRes.data || []).map((p: { id: string }) => p.id);
  if (playlistIds.length > 0) {
    const { data: ps } = await supabase
      .from('playlist_songs')
      .select('playlist_id, song_id, position, added_at')
      .in('playlist_id', playlistIds);
    if (ps) playlistSongs = ps;
  }

  // playlistSongsRes was a placeholder above; ignore it.
  void playlistSongsRes;

  const payload = {
    exported_at: new Date().toISOString(),
    app: 'EchoNest',
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile: profileRes.data || null,
    counts: {
      songs: songsRes.data?.length || 0,
      playlists: playlistsRes.data?.length || 0,
      playlist_songs: playlistSongs.length,
      likes: likesRes.data?.length || 0,
      recently_played: recentRes.data?.length || 0,
      albums: albumsRes.data?.length || 0,
      artists: artistsRes.data?.length || 0,
    },
    songs: songsRes.data || [],
    playlists: playlistsRes.data || [],
    playlist_songs: playlistSongs,
    likes: likesRes.data || [],
    recently_played: recentRes.data || [],
    albums: albumsRes.data || [],
    artists: artistsRes.data || [],
    youtube_connection: ytTokensRes.data || null,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="echonest-${user.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
