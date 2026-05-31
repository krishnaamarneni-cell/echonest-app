// Plain read-only REST endpoint for AI agents / scripts that don't speak
// the Model Context Protocol. Same MCP tokens authenticate this — pass
// them as `Authorization: Bearer mcp_xxx`. Returns a snapshot of the
// user's EchoNest state in one shot:
//   { now_playing, recent, liked_count, playlists }
//
// MCP clients should prefer /api/mcp for full tool access; this endpoint
// is for simple "what is the user listening to right now" style queries
// from a shell script, Zapier, n8n, a custom GPT action, etc.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { hashToken, looksLikeToken } from '@/lib/mcpTokens';

export const runtime = 'nodejs';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function userIdFromToken(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  const token = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  if (!looksLikeToken(token)) return null;
  const supa = admin();
  const { data } = await supa
    .from('mcp_tokens')
    .select('user_id, revoked_at, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
  return data.user_id as string;
}

export async function GET(req: NextRequest) {
  const userId = await userIdFromToken(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized — pass an MCP token in the Authorization: Bearer header' },
      { status: 401 },
    );
  }

  const supa = admin();
  const [playbackRes, recentRes, likedCountRes, playlistsRes] = await Promise.all([
    supa
      .from('playback_state')
      .select('song, position, is_playing, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supa
      .from('recently_played')
      .select('played_at, song:songs(id, title, artist_name, cover_url)')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(10),
    supa
      .from('liked_songs')
      .select('song_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supa
      .from('playlists')
      .select('id, title, description, cover_url, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    now_playing: playbackRes.data?.is_playing ? playbackRes.data.song : null,
    position_seconds: playbackRes.data?.position ?? 0,
    recent: recentRes.data || [],
    liked_count: likedCountRes.count || 0,
    playlists: playlistsRes.data || [],
  });
}
