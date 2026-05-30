// MCP token management for the signed-in user.
//
//   GET    /api/mcp/tokens          -> list this user's tokens (no plaintext)
//   POST   /api/mcp/tokens { name } -> create a new token; returns plaintext ONCE
//
// Revocation lives at /api/mcp/tokens/[id] (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateToken } from '@/lib/mcpTokens';

export const runtime = 'nodejs';

async function userClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // SSR cookies are immutable in some contexts — safe to ignore.
          }
        },
      },
    },
  );
}

export async function GET() {
  const supa = await userClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supa
    .from('mcp_tokens')
    .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ tokens: data || [] });
}

export async function POST(req: NextRequest) {
  const supa = await userClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name || '').trim().slice(0, 60) || 'Untitled token';

  const t = generateToken();
  const { error } = await supa.from('mcp_tokens').insert({
    user_id: user.id,
    name,
    token_hash: t.hash,
    token_prefix: t.prefix,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the plaintext token THIS ONCE — the UI shows it to the user,
  // then it's lost forever (we only store the hash).
  return NextResponse.json({
    token: t.token,
    prefix: t.prefix,
    name,
  });
}
