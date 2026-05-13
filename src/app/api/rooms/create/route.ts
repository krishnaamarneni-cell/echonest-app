import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Generate a short, easy-to-share room code
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { song?: unknown; isPlaying?: boolean; position?: number } = {};
  try {
    body = await req.json();
  } catch {}

  // Try a few times to find an unused code (collisions are rare with 6 chars)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from('listening_rooms')
      .insert({
        code,
        current_song: body.song || null,
        position_seconds: body.position || 0,
        is_playing: !!body.isPlaying,
        last_action_by: user.id,
        last_action_at: new Date().toISOString(),
      })
      .select('id, code')
      .single();
    if (!error && data) {
      return NextResponse.json({ id: data.id, code: data.code });
    }
    // Duplicate-key error → try a new code
  }

  return NextResponse.json({ error: 'Could not create room' }, { status: 500 });
}
