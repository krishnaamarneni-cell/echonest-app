import { NextRequest, NextResponse } from 'next/server';

/**
 * Start a YouTube connection WITHOUT touching the user's EchoNest login.
 *
 * The old flow used supabase.auth.signInWithOAuth('google'), which is a full
 * sign-in: picking a different Google account switched the whole EchoNest
 * session to that account (and created a new user). That's wrong — connecting
 * YouTube should just authorize read access to whatever Google account the
 * user picks and import its data into their CURRENT account.
 *
 * So we run Google's OAuth directly (using GOOGLE_OAUTH_CLIENT_ID), ask only
 * for youtube.readonly + offline access, and send the result to our own
 * callback at /api/youtube/oauth-callback. The Supabase session is never
 * involved, so the user stays logged in as themselves.
 *
 * NOTE: the redirect URI below ("<origin>/api/youtube/oauth-callback") must be
 * added to the Google Cloud OAuth client's "Authorized redirect URIs".
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/settings?yt_error=GOOGLE_OAUTH_CLIENT_ID%20not%20configured', req.url),
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/youtube/oauth-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline', // get a refresh_token for background sync
    prompt: 'consent', // force the account chooser + always return refresh_token
    include_granted_scopes: 'true',
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
