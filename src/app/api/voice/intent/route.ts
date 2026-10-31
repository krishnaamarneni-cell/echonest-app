import { NextRequest, NextResponse } from 'next/server';
import { groqConfigured, groqJson } from '@/lib/groq';

/**
 * Interpret an utterance the rule parser could not place.
 *
 * This route is the OPTIONAL half of the voice assistant. Playing a
 * playlist, your likes, or a searched song needs no model at all — those
 * are matched locally in voiceIntent.ts before anything reaches here. What
 * lands here is the residue: phrasing the rules do not cover, or a request
 * with no literal handle in it ("something upbeat", "that song from the
 * film with the train").
 *
 * With no GROQ_API_KEY this answers 501 and the client stops asking, which
 * is why the feature is complete without one.
 *
 * The model never names a playlist. It is handed the real list and must
 * return an id from it, so a wrong answer is a wrong pick from a closed set
 * rather than a title that does not exist. The client re-checks the id
 * against the same list before acting on it.
 */

interface Body {
  transcript?: string;
  context?: {
    playlists?: Array<{ id?: string; title?: string; count?: number }>;
    likedCount?: number;
    pending?: string[];
    nowPlaying?: string | null;
  };
}

const SYSTEM = `You convert one spoken command for a music app into a single JSON action.

Reply with ONLY a JSON object:
{
  "action": "play_playlist" | "play_liked" | "play_all" | "search" | "choose" | "transport" | "shuffle" | "unknown",
  "playlist_id": "<exact id from the PLAYLISTS list>",
  "query": "<what to search for>",
  "autoplay": true | false,
  "pick": <1-based result number>,
  "index": <1-based number from PENDING>,
  "op": "pause" | "resume" | "next" | "previous",
  "on": true | false,
  "shuffle": true | false,
  "say": "<one short sentence to read aloud>"
}

Rules:
- "playlist_id" MUST be copied exactly from the PLAYLISTS list. Never invent one. If no playlist matches, do not use play_playlist.
- Use "search" for anything not already in the user's library — a song, artist, album or film. Set "autoplay": true to play the best match at once. Set "autoplay": false to offer a numbered list, which is right when the user asked for songs FROM something (a film or album) without naming one track.
- Use "choose" only when PENDING is non-empty and the user is picking from it.
- Use "transport" for pause/resume/skip, "shuffle" to turn shuffling on or off.
- Use "unknown" if the command is not about playing music. Put a brief explanation in "say".
- "say" is spoken aloud: under 12 words, no markdown, no emoji.
- Include only the fields the chosen action needs.`;

export async function POST(req: NextRequest) {
  if (!groqConfigured()) {
    return NextResponse.json(
      { error: 'No GROQ_API_KEY configured; using local parsing only.' },
      { status: 501 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const transcript = body.transcript?.trim().slice(0, 300);
  if (!transcript) {
    return NextResponse.json({ error: 'No transcript' }, { status: 400 });
  }

  const ctx = body.context || {};
  // Capped so a large library cannot inflate the prompt without bound.
  const playlists = (ctx.playlists || [])
    .filter((p) => p.id && p.title)
    .slice(0, 60)
    .map((p) => `${p.id} :: ${p.title} (${p.count ?? 0} songs)`)
    .join('\n');
  const pending = (ctx.pending || [])
    .slice(0, 10)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  const user = [
    `PLAYLISTS (id :: title):\n${playlists || '(none)'}`,
    `LIKED SONGS: ${ctx.likedCount ?? 0}`,
    `NOW PLAYING: ${ctx.nowPlaying || '(nothing)'}`,
    `PENDING (a numbered list just offered):\n${pending || '(none)'}`,
    `COMMAND: "${transcript}"`,
  ].join('\n\n');

  const command = await groqJson(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    { maxTokens: 220 },
  );

  if (!command) {
    return NextResponse.json({ error: 'Interpretation failed' }, { status: 502 });
  }

  return NextResponse.json({ command });
}
