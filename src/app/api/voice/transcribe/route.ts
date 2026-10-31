import { NextRequest, NextResponse } from 'next/server';
import { groqConfigured, groqTranscribe } from '@/lib/groq';

/**
 * Transcribe a short recorded clip.
 *
 * Only reached on browsers with no speech recognition of their own —
 * Firefox, mainly. Chrome, Android and Safari on iOS 14.5+ all transcribe
 * on the device, which is faster, free, and streams partial text as you
 * talk, so the phone this feature was asked for never comes through here.
 */

// A spoken command is a couple of seconds. Anything much larger is not a
// command, and rejecting it early keeps a stray upload off the Whisper bill.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!groqConfigured()) {
    return NextResponse.json(
      { error: 'No GROQ_API_KEY configured; this browser cannot transcribe locally.' },
      { status: 501 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'No audio' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Clip too long' }, { status: 413 });
  }

  const name = audio instanceof File && audio.name ? audio.name : 'clip.webm';
  const text = await groqTranscribe(audio, name);

  if (text === null) {
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  return NextResponse.json({ text });
}
