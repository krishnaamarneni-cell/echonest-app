import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Server-side signout — clears the Supabase auth cookies properly.
// The client-side supabase.auth.signOut() alone doesn't always invalidate
// the SSR cookies, so a manual reload would still appear signed in.
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'signout failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
