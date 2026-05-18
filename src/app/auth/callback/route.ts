import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * OAuth callback for Supabase Auth.
 *
 * After Google grants consent, the user is redirected to
 *   /auth/callback?code=...&next=/dashboard
 *
 * We exchange the code for a session (this stores the access + refresh
 * tokens server-side via Supabase) and then redirect to `next` so the
 * user lands wherever they were trying to go.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/dashboard';
  const errParam = url.searchParams.get('error');

  // The user clicked "Cancel" on Google's consent screen.
  if (errParam) {
    return NextResponse.redirect(new URL(`/login?manual=1&oauth_error=${encodeURIComponent(errParam)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL('/login?manual=1', req.url));
  }

  // Build a Supabase client bound to this request's cookie store so the
  // session cookies get set on the response.
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?manual=1&oauth_error=${encodeURIComponent(error.message)}`, req.url),
    );
  }

  // Clear the "user explicitly signed out" flag — they just signed back in.
  // We can't touch localStorage from the server, so we just redirect; the
  // session cookie is what AppLayout reads.
  const dest = new URL(next.startsWith('/') ? next : '/dashboard', req.url);
  return NextResponse.redirect(dest);
}
