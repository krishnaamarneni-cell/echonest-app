import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // The auth check must never be able to take the whole site down.
  //
  // Vercel kills middleware that runs too long, and the failure mode is
  // brutal: MIDDLEWARE_INVOCATION_TIMEOUT returns 504 for EVERY route,
  // including the landing page and other routes that need no auth at all.
  // getUser() is a network round-trip to Supabase on every single request,
  // so anything that makes Supabase slow makes the entire app unreachable.
  // That is exactly what happened when the Supabase project went away, and
  // a cold start alone has been measured at ~8.7s.
  //
  // So: cap it, and fail OPEN. If we can't establish who the user is in
  // time, serve the page as an anonymous visitor rather than bouncing them
  // to /login — a transient backend blip should not look like being logged
  // out. This leaks nothing: every table is protected by RLS, so an
  // unauthenticated request simply sees no rows, and the client re-checks
  // auth on mount anyway.
  const AUTH_TIMEOUT_MS = 2500;
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  let authKnown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('auth timeout')), AUTH_TIMEOUT_MS);
      }),
    ]);
    user = result.data.user;
    authKnown = true;
  } catch {
    // Left unknown on purpose — the guards below skip redirecting when we
    // couldn't determine auth state.
  } finally {
    if (timer) clearTimeout(timer);
  }

  const path = request.nextUrl.pathname;
  const isAuthPage = path === '/login' || path === '/signup';
  const isPasswordPage = path === '/forgot-password' || path === '/reset-password';
  const isApiRoute = path.startsWith('/api/');
  const isPublicPage = path === '/' || isAuthPage || isPasswordPage || isApiRoute;

  // If the deployment has a public account configured, treat the whole site
  // as accessible without auth — the client will auto-sign-in as the public
  // account on mount.
  const publicAccountEnabled = !!process.env.PUBLIC_USER_EMAIL && !!process.env.PUBLIC_USER_PASSWORD;

  if (authKnown && !user && !isPublicPage && !publicAccountEnabled) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Don't bounce the public account away from /login or /signup — visitors
  // on the shared account need to be able to reach those pages to make
  // their own account.
  const publicEmail = process.env.PUBLIC_USER_EMAIL;
  const isPublicAccount = !!user && !!publicEmail && user.email === publicEmail;

  if (authKnown && user && isAuthPage && !isPublicAccount) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Landing page (/) is always accessible — even when logged in — so users
  // can click the logo to come back here. The landing page itself shows a
  // 'Open library' button for logged-in visitors.

  return supabaseResponse;
}
