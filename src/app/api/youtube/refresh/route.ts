import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Exchange a stored Google refresh token for a fresh access token.
 *
 * Called by the client whenever it needs to call YouTube's API but its
 * cached access token has expired (or it doesn't have one yet because the
 * Supabase session lost the provider_token on JWT refresh).
 *
 * Why server-side: Google's token exchange requires the OAuth client
 * secret, which must never be in the browser bundle. We hold it as an
 * env var on Vercel.
 *
 * Auth model: this route reads the user's Supabase session from cookies,
 * looks up their row in user_youtube_tokens (RLS scoped to themselves),
 * uses the refresh_token to mint a new access_token from Google, writes
 * the new access_token + expires_at back to the same row, and returns
 * the access token to the caller.
 */

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export async function POST(_req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'GOOGLE_OAUTH_CLIENT_ID / SECRET not configured on the server' },
      { status: 503 },
    );
  }

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

  // RLS makes this only return the calling user's own row
  const { data: row, error: rowErr } = await supabase
    .from('user_youtube_tokens')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json(
      { error: 'No YouTube tokens on file — reconnect required.' },
      { status: 404 },
    );
  }

  // If the cached access token is still fresh (with a 60s safety margin),
  // skip the network round-trip and just hand it back.
  const expiresAt = new Date(row.expires_at as string).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return NextResponse.json({
      access_token: row.access_token,
      expires_at: row.expires_at,
      cached: true,
    });
  }

  // Exchange the refresh token for a new access token
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token as string,
    grant_type: 'refresh_token',
  });

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const tokenData = (await tokenResp.json()) as GoogleTokenResponse;

  if (!tokenResp.ok || !tokenData.access_token) {
    // If Google says invalid_grant the user revoked access on their side.
    // Wipe the stored tokens so the UI re-prompts for Connect.
    if (tokenData.error === 'invalid_grant') {
      await supabase.from('user_youtube_tokens').delete().eq('user_id', user.id);
    }
    return NextResponse.json(
      {
        error: tokenData.error_description || tokenData.error || 'Refresh failed',
      },
      { status: 502 },
    );
  }

  const newExpiresAt = new Date(
    Date.now() + (tokenData.expires_in || 3600) * 1000,
  ).toISOString();

  await supabase
    .from('user_youtube_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  return NextResponse.json({
    access_token: tokenData.access_token,
    expires_at: newExpiresAt,
    cached: false,
  });
}
