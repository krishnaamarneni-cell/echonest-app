import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Signs the current visitor in as the public account so the entire library is
 * shared. Triggered automatically by the client when no session exists.
 *
 * The public account's credentials are stored as Vercel env vars so they
 * never reach the browser.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const publicEmail = process.env.PUBLIC_USER_EMAIL;
  const publicPassword = process.env.PUBLIC_USER_PASSWORD;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 500 },
    );
  }

  if (!publicEmail || !publicPassword) {
    return NextResponse.json(
      { error: 'Public account not configured (set PUBLIC_USER_EMAIL and PUBLIC_USER_PASSWORD)' },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Ignore cookie setting errors in environments where it's not allowed
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: publicEmail,
    password: publicPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
