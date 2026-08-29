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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === '/login' || path === '/signup';
  const isPasswordPage = path === '/forgot-password' || path === '/reset-password';
  const isApiRoute = path.startsWith('/api/');
  const isPublicPage = path === '/' || isAuthPage || isPasswordPage || isApiRoute;

  // If the deployment has a public account configured, treat the whole site
  // as accessible without auth — the client will auto-sign-in as the public
  // account on mount.
  const publicAccountEnabled = !!process.env.PUBLIC_USER_EMAIL && !!process.env.PUBLIC_USER_PASSWORD;

  if (!user && !isPublicPage && !publicAccountEnabled) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Don't bounce the public account away from /login or /signup — visitors
  // on the shared account need to be able to reach those pages to make
  // their own account.
  const publicEmail = process.env.PUBLIC_USER_EMAIL;
  const isPublicAccount = !!user && !!publicEmail && user.email === publicEmail;

  if (user && isAuthPage && !isPublicAccount) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Landing page (/) is always accessible — even when logged in — so users
  // can click the logo to come back here. The landing page itself shows a
  // 'Open library' button for logged-in visitors.

  return supabaseResponse;
}
