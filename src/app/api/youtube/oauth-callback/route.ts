import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Callback for the direct YouTube OAuth flow started by /api/youtube/connect.
 *
 * Crucially this does NOT call any supabase.auth sign-in method, so the user's
 * EchoNest session is unchanged — they stay logged in as whoever they were.
 * We just exchange Google's auth code for access + refresh tokens and store
 * them in user_youtube_tokens for the CURRENT user, then kick off the import.
 *
 * Result: a user can connect ANY Google/YouTube account (even a different one)
 * to import its library into their own account, without account-switching.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return NextResponse.redirect(
      new URL(`/settings?yt_error=${encodeURIComponent(errParam)}`, req.url),
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL('/settings?yt_error=no_code', req.url));
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/settings?yt_error=oauth_not_configured', req.url),
    );
  }

  // Read the CURRENT EchoNest session — we attach the YouTube tokens to this
  // user. We never sign in / switch here.
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
    return NextResponse.redirect(new URL('/login?manual=1', req.url));
  }

  // Exchange the authorization code for tokens.
  const redirectUri = `${url.origin}/api/youtube/oauth-callback`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  const token = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenResp.ok || !token.access_token) {
    return NextResponse.redirect(
      new URL(
        `/settings?yt_error=${encodeURIComponent(token.error_description || token.error || 'token_exchange_failed')}`,
        req.url,
      ),
    );
  }

  const expiresAt = new Date(
    Date.now() + (token.expires_in || 3600) * 1000,
  ).toISOString();

  // Upsert the tokens for the current user. If Google didn't return a fresh
  // refresh_token (it only does on first consent for an account), keep the
  // existing one so background sync keeps working.
  const existing = await supabase
    .from('user_youtube_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();
  const refreshToken =
    token.refresh_token || (existing.data?.refresh_token as string | undefined) || null;

  const { error: upErr } = await supabase.from('user_youtube_tokens').upsert(
    {
      user_id: user.id,
      access_token: token.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scopes: 'https://www.googleapis.com/auth/youtube.readonly',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (upErr) {
    return NextResponse.redirect(
      new URL(`/settings?yt_error=${encodeURIComponent(upErr.message)}`, req.url),
    );
  }

  // Hand off to the settings page, which auto-runs the import on yt_import=1.
  return NextResponse.redirect(new URL('/settings?yt_import=1', req.url));
}
