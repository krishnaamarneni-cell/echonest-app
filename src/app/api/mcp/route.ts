// MCP (Model Context Protocol) server — lets Claude Desktop, Cursor, Zed,
// etc. drive EchoNest by chat. Speaks JSON-RPC 2.0 over a single POST
// endpoint (the "Streamable HTTP" MCP transport, simplest non-stdio form).
//
// Auth: per-user personal access token in the URL (?token=mcp_xxx). The
// token resolves to a user_id; every tool below scopes its Supabase
// queries to that user_id. No cookies, no Supabase auth session.
//
// Tools fall into three buckets:
//   - READ:  search_songs, get_now_playing, list_playlists, …
//   - WRITE: like_song, add_song_to_playlist (touch Supabase directly)
//   - CONTROL: play_song (writes to the playback_state table; the user
//     needs an open EchoNest tab with cross-device sync ON for it to
//     actually start playing — otherwise it's a queued intent).

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { hashToken, looksLikeToken } from '@/lib/mcpTokens';
import { proxySearch } from '@/lib/ytSearch';

export const runtime = 'nodejs';

// ---- JSON-RPC plumbing -----------------------------------------------------

type JsonRpcReq = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: number | string | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}
function rpcError(
  id: number | string | null | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, data },
  });
}

// ---- Tool definitions (advertised to the AI client) ------------------------

const TOOLS = [
  {
    name: 'search_songs',
    description:
      "Search the user's EchoNest library by title or artist. Returns matching songs with their IDs (use those IDs with play_song/like_song/add_song_to_playlist).",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        limit: { type: 'number', description: 'Max results (default 10, max 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_youtube',
    description:
      "Search YouTube via the user's proxy for songs not yet in their library. Returns video IDs you can add later (not directly playable via play_song).",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_now_playing',
    description:
      "Get the song currently playing on the user's EchoNest (across any device with cross-device sync). Returns null if nothing is playing.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'play_song',
    description:
      'Start playing a song by its EchoNest song ID. Requires the user to have an open EchoNest tab with cross-device sync turned on; otherwise the song is queued as the "now playing" but no audio starts until they open the app.',
    inputSchema: {
      type: 'object',
      properties: { song_id: { type: 'string' } },
      required: ['song_id'],
    },
  },
  {
    name: 'like_song',
    description: "Add a song to the user's Liked Songs.",
    inputSchema: {
      type: 'object',
      properties: { song_id: { type: 'string' } },
      required: ['song_id'],
    },
  },
  {
    name: 'unlike_song',
    description: "Remove a song from the user's Liked Songs.",
    inputSchema: {
      type: 'object',
      properties: { song_id: { type: 'string' } },
      required: ['song_id'],
    },
  },
  {
    name: 'list_playlists',
    description: "List the user's playlists.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_playlist_songs',
    description: 'List songs in a specific playlist.',
    inputSchema: {
      type: 'object',
      properties: { playlist_id: { type: 'string' } },
      required: ['playlist_id'],
    },
  },
  {
    name: 'add_song_to_playlist',
    description: 'Add a song to a playlist.',
    inputSchema: {
      type: 'object',
      properties: {
        song_id: { type: 'string' },
        playlist_id: { type: 'string' },
      },
      required: ['song_id', 'playlist_id'],
    },
  },
  {
    name: 'get_recent_played',
    description: 'List the songs the user has played most recently.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max results (default 10)' } },
    },
  },
] as const;

// ---- Admin Supabase client (resolves tokens, runs tools as the user) -------

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function userIdFromToken(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url);
  const token =
    url.searchParams.get('token') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';
  if (!looksLikeToken(token)) return null;
  const supa = admin();
  const { data } = await supa
    .from('mcp_tokens')
    .select('user_id, revoked_at, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
  // Fire-and-forget bump last_used_at — don't await.
  supa.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hashToken(token)).then(() => {});
  return data.user_id as string;
}

// ---- Tool implementations --------------------------------------------------

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

async function call(name: string, args: Args, userId: string): Promise<unknown> {
  const supa = admin();

  switch (name) {
    case 'search_songs': {
      const q = str(args.query).trim();
      const limit = Math.min(50, Math.max(1, num(args.limit, 10)));
      if (!q) return { songs: [] };
      const pattern = `%${q}%`;
      const { data } = await supa
        .from('songs')
        .select('id, title, artist_name, album_name, duration, cover_url, youtube_id, source')
        .or(`title.ilike.${pattern},artist_name.ilike.${pattern}`)
        .limit(limit);
      return { songs: data || [] };
    }

    case 'search_youtube': {
      const q = str(args.query).trim();
      if (!q) return { videos: [] };
      const videos = await proxySearch(q);
      return { videos };
    }

    case 'get_now_playing': {
      const { data } = await supa
        .from('playback_state')
        .select('song, position, is_playing, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) return { now_playing: null };
      return {
        now_playing: data.is_playing ? data.song : null,
        position_seconds: data.position,
        updated_at: data.updated_at,
      };
    }

    case 'play_song': {
      const songId = str(args.song_id).trim();
      if (!songId) throw new Error('song_id required');
      const { data: song } = await supa
        .from('songs')
        .select('*')
        .eq('id', songId)
        .maybeSingle();
      if (!song) throw new Error(`song ${songId} not found`);
      // Write to playback_state — the user's open EchoNest tab(s) with
      // cross-device sync ON will pick this up and start playing.
      await supa
        .from('playback_state')
        .upsert(
          {
            user_id: userId,
            song,
            position: 0,
            is_playing: true,
            device_id: 'mcp',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      return {
        ok: true,
        message:
          'Queued. The song will start playing on any open EchoNest tab that has cross-device sync enabled.',
        song: { id: song.id, title: song.title, artist: song.artist_name },
      };
    }

    case 'like_song': {
      const songId = str(args.song_id).trim();
      if (!songId) throw new Error('song_id required');
      await supa
        .from('liked_songs')
        .upsert({ user_id: userId, song_id: songId }, { onConflict: 'user_id,song_id' });
      return { ok: true };
    }

    case 'unlike_song': {
      const songId = str(args.song_id).trim();
      if (!songId) throw new Error('song_id required');
      await supa
        .from('liked_songs')
        .delete()
        .eq('user_id', userId)
        .eq('song_id', songId);
      return { ok: true };
    }

    case 'list_playlists': {
      const { data } = await supa
        .from('playlists')
        .select('id, title, description, cover_url, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      return { playlists: data || [] };
    }

    case 'get_playlist_songs': {
      const pid = str(args.playlist_id).trim();
      if (!pid) throw new Error('playlist_id required');
      const { data } = await supa
        .from('playlist_songs')
        .select('position, song:songs(id, title, artist_name, duration, cover_url)')
        .eq('playlist_id', pid)
        .order('position', { ascending: true });
      return { songs: (data || []).map((r) => r.song) };
    }

    case 'add_song_to_playlist': {
      const songId = str(args.song_id).trim();
      const pid = str(args.playlist_id).trim();
      if (!songId || !pid) throw new Error('song_id and playlist_id required');
      // Verify the playlist belongs to this user.
      const { data: pl } = await supa
        .from('playlists')
        .select('id')
        .eq('id', pid)
        .eq('user_id', userId)
        .maybeSingle();
      if (!pl) throw new Error('playlist not found or not owned by user');
      // Append at the end.
      const { count } = await supa
        .from('playlist_songs')
        .select('*', { count: 'exact', head: true })
        .eq('playlist_id', pid);
      await supa
        .from('playlist_songs')
        .insert({ playlist_id: pid, song_id: songId, position: count ?? 0 });
      return { ok: true };
    }

    case 'get_recent_played': {
      const limit = Math.min(50, Math.max(1, num(args.limit, 10)));
      const { data } = await supa
        .from('recently_played')
        .select('played_at, song:songs(id, title, artist_name, cover_url)')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(limit);
      return { recent: data || [] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- HTTP handler ----------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: JsonRpcReq;
  try {
    body = (await req.json()) as JsonRpcReq;
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  const { id, method, params } = body;

  // Initialize handshake — open to anyone, so clients can negotiate before
  // we reject for a bad token on the first real tool call.
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'echonest', version: '1.0.0' },
    });
  }

  // Every other method requires a valid token.
  const userId = await userIdFromToken(req);
  if (!userId) return rpcError(id, -32001, 'Unauthorized: invalid or missing MCP token');

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const name = String(params?.name || '');
    const args = (params?.arguments as Args) || {};
    try {
      const result = await call(name, args, userId);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return rpcResult(id, {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

// GET responds with a friendly message so visiting the URL in a browser
// doesn't show a confusing error — useful when the user pastes the URL
// to confirm it works.
export async function GET(req: NextRequest) {
  const userId = await userIdFromToken(req);
  return NextResponse.json({
    server: 'echonest-mcp',
    version: '1.0.0',
    authenticated: !!userId,
    transport: 'streamable-http',
    hint: 'POST JSON-RPC 2.0 requests here. Configure this URL in your AI client (Claude Desktop, Cursor, Zed, etc.) as an MCP server.',
  });
}
