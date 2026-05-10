import { NextRequest, NextResponse } from 'next/server';

/**
 * Verifies an owner-mode password. Used to "unlock" delete buttons in the UI
 * after the visitor proves they're the account owner.
 *
 * The OWNER_PASSWORD is set as a Vercel env var, separate from the Supabase
 * password (you choose any string). Compared on the server so the password
 * never reaches the client.
 */
export async function POST(request: NextRequest) {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    return NextResponse.json(
      { error: 'Owner mode not configured (set OWNER_PASSWORD)' },
      { status: 500 },
    );
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.password || body.password !== ownerPassword) {
    // Don't reveal whether the password was empty or wrong
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
