/**
 * Turning a spoken sentence into one thing the player can do.
 *
 * Two parsers live behind the same type. The rule parser below runs first:
 * it is instant, costs nothing, needs no API key, and handles the phrasings
 * that actually come up at the wheel ("play my sleep playlist", "next",
 * "shuffle my liked songs"). Only when it comes back `unknown` does the
 * caller pay for a round trip to Groq.
 *
 * That order is deliberate. A command you give while driving should feel
 * immediate, and the common cases are a regex — spending 600ms and a token
 * budget to re-derive "next" would be silly. It also means the bubble works
 * before any key is configured, and simply gets better with one.
 *
 * Nothing here touches the player. Resolving a command to real songs and
 * playing them is voiceExecute.ts; keeping the two apart is what lets this
 * file be shared by the client and the API route.
 */

/** A playlist as the parser sees it — id and title, nothing else needed. */
export interface VoicePlaylist {
  id: string;
  title: string;
  count: number;
}

/** What the assistant knows when it interprets an utterance. */
export interface VoiceContext {
  playlists: VoicePlaylist[];
  likedCount: number;
  /**
   * Titles the assistant last offered as a numbered list. Their presence is
   * what makes a bare "the second one" meaningful — without them an ordinal
   * is just a word.
   */
  pending: string[];
  nowPlaying?: string | null;
}

export type VoiceAction =
  | { kind: 'play_playlist'; playlistId: string; shuffle?: boolean }
  | { kind: 'play_liked'; shuffle?: boolean }
  | { kind: 'play_all'; shuffle?: boolean }
  /**
   * Search YouTube. `autoplay` plays the top hit straight away; without it
   * the results come back as a numbered list to choose from. `pick` is for
   * "play the second song from <movie>" — search, then take that one.
   */
  | { kind: 'search'; query: string; autoplay: boolean; pick?: number }
  | { kind: 'choose'; index: number }
  | { kind: 'transport'; op: 'pause' | 'resume' | 'next' | 'previous' }
  | { kind: 'shuffle'; on: boolean }
  | { kind: 'unknown' };

export interface VoiceCommand {
  action: VoiceAction;
  /** One short line to speak back. Short because it is read aloud. */
  say: string;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'my', 'me', 'please', 'playlist', 'list', 'songs', 'song',
  'music', 'from', 'of', 'in', 'on', 'to', 'all', 'some', 'and',
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t && !STOP_WORDS.has(t));
}

/**
 * Find which playlist an utterance is talking about.
 *
 * Exact-substring wins, longest first: if a playlist is literally called
 * "Love Songs" and the user said "play love songs", that is not a guess.
 * Failing that, score by how much of the TITLE the utterance covers —
 * title-side rather than utterance-side, because "start playing songs from
 * my sleep playlist" is mostly filler and would drag any
 * utterance-normalised score below a useful threshold.
 *
 * Returns null rather than a weak guess. Playing the wrong playlist while
 * someone is driving is worse than admitting you did not catch it.
 */
export function matchPlaylist(
  utterance: string,
  playlists: VoicePlaylist[],
): VoicePlaylist | null {
  const norm = normalize(utterance);
  const spoken = new Set(tokens(utterance));

  let best: { pl: VoicePlaylist; score: number } | null = null;

  for (const pl of playlists) {
    const title = normalize(pl.title);
    if (!title) continue;

    // A whole-title hit scores above any partial one, longer titles first.
    if (norm.includes(title)) {
      const score = 100 + title.length;
      if (!best || score > best.score) best = { pl, score };
      continue;
    }

    const titleTokens = tokens(pl.title);
    if (titleTokens.length === 0) continue;
    const hits = titleTokens.filter((t) => spoken.has(t)).length;
    const coverage = hits / titleTokens.length;
    // Two thirds of the title, and never on a single incidental word
    // unless the title really is one word.
    if (coverage >= 0.66 && (hits > 1 || titleTokens.length === 1)) {
      const score = coverage * 10 + hits;
      if (!best || score > best.score) best = { pl, score };
    }
  }

  return best ? best.pl : null;
}

const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1, one: 1,
  second: 2, '2nd': 2, two: 2,
  third: 3, '3rd': 3, three: 3,
  fourth: 4, '4th': 4, four: 4,
  fifth: 5, '5th': 5, five: 5,
  sixth: 6, '6th': 6, six: 6,
  last: -1,
};

function readOrdinal(norm: string): number | null {
  const m = norm.match(
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|last|one|two|three|four|five|six)\b/,
  );
  if (m) return ORDINALS[m[1]] ?? null;
  const n = norm.match(/\b(?:number|no)\s*(\d+)\b/) || norm.match(/^(\d+)$/);
  if (n) return parseInt(n[1], 10);
  return null;
}

/** Strip the polite lead-in so what remains is the actual subject. */
function stripLead(norm: string): string {
  return norm
    .replace(
      /^(hey |ok |okay )?(echo ?nest|nest)?[\s,]*(can you |could you |please |i want to |i'd like to )?/,
      '',
    )
    .replace(/^(start |begin )?(playing|play|put on|queue up|queue|listen to)\s+/, '')
    .replace(/^(me |my |the |some |a )+/, '')
    .trim();
}

const LIKED_RE = /\b(liked|likes|favou?rites?|loved|hearts?)\b/;

/**
 * The fast path. Returns `unknown` for anything it is not confident about,
 * which is the signal to ask Groq.
 */
export function parseLocally(transcript: string, ctx: VoiceContext): VoiceCommand {
  const norm = normalize(transcript);
  if (!norm) return { action: { kind: 'unknown' }, say: "I didn't catch that." };

  // --- Transport. Checked first: these are the shortest utterances and the
  // ones that must never be mistaken for a search.
  if (/^(pause|hold on|wait|stop|shut up|quiet)\b/.test(norm)) {
    return { action: { kind: 'transport', op: 'pause' }, say: 'Paused.' };
  }
  if (/^(resume|continue|carry on|keep going|unpause|go on|play)$/.test(norm)) {
    return { action: { kind: 'transport', op: 'resume' }, say: 'Playing.' };
  }
  if (/^(next|skip|next (song|one|track)|skip (this|it)|change)\b/.test(norm)) {
    return { action: { kind: 'transport', op: 'next' }, say: 'Next.' };
  }
  if (/^(previous|back|go back|last (song|one)|previous (song|one|track))\b/.test(norm)) {
    return { action: { kind: 'transport', op: 'previous' }, say: 'Going back.' };
  }
  if (/^shuffle (on|it|them)?$/.test(norm) || /^(turn on |enable )?shuffle$/.test(norm)) {
    return { action: { kind: 'shuffle', on: true }, say: 'Shuffle on.' };
  }
  if (/\bshuffle (off|stop)\b/.test(norm) || /\b(turn off|disable) shuffle\b/.test(norm)) {
    return { action: { kind: 'shuffle', on: false }, say: 'Shuffle off.' };
  }

  const wantsShuffle = /\bshuffle\b/.test(norm) || /\brandom\b/.test(norm);

  // --- Picking from a list we just read out. Only valid while a list is
  // actually on offer, otherwise "play number one" is a search.
  if (ctx.pending.length > 0) {
    const ord = readOrdinal(norm);
    if (ord !== null) {
      const index = ord === -1 ? ctx.pending.length : ord;
      if (index >= 1 && index <= ctx.pending.length) {
        return { action: { kind: 'choose', index }, say: 'Playing it.' };
      }
    }
  }

  // --- Liked songs.
  if (LIKED_RE.test(norm)) {
    return {
      action: { kind: 'play_liked', shuffle: wantsShuffle },
      say: ctx.likedCount
        ? `${wantsShuffle ? 'Shuffling' : 'Playing'} your liked songs.`
        : 'You have no liked songs yet.',
    };
  }

  // --- Everything.
  if (/\b(everything|all (my |the )?(songs|music|playlists))\b/.test(norm)) {
    return {
      action: { kind: 'play_all', shuffle: wantsShuffle },
      say: wantsShuffle ? 'Shuffling everything.' : 'Playing everything.',
    };
  }

  // --- A playlist by name. Checked before search so "play love songs"
  // reaches your own playlist rather than YouTube.
  const pl = matchPlaylist(norm, ctx.playlists);
  if (pl) {
    return {
      action: { kind: 'play_playlist', playlistId: pl.id, shuffle: wantsShuffle },
      say: `${wantsShuffle ? 'Shuffling' : 'Playing'} ${pl.title}.`,
    };
  }

  // --- Search. Only when the sentence actually asked to play something;
  // a stray remark should not fire a search.
  if (!/\b(play|playing|put on|listen|queue|songs?|music|album|movie)\b/.test(norm)) {
    return { action: { kind: 'unknown' }, say: "I didn't catch that." };
  }

  const subject = stripLead(norm);
  if (!subject) return { action: { kind: 'unknown' }, say: "I didn't catch that." };

  const pick = readOrdinal(subject);

  // "songs from <movie>" is a request for a SET, so offer a choice rather
  // than guessing which track. "play <title> from <movie>" names one thing,
  // so just play it.
  const set = subject.match(
    /\b(songs?|music|tracks?|album|soundtrack)\s+(?:from|of|in)\s+(?:the\s+)?(?:movie\s+|film\s+|album\s+)?(.+)$/,
  );
  if (set) {
    const subjectName = set[2].replace(/\b(movie|film|album|songs?)\b/g, '').trim();
    if (subjectName) {
      return {
        action: {
          kind: 'search',
          query: `${subjectName} songs`,
          autoplay: pick !== null,
          pick: pick ?? undefined,
        },
        say: pick !== null ? `Looking up ${subjectName}.` : `Here's what I found for ${subjectName}.`,
      };
    }
  }

  const query = subject.replace(/\b(for me|right now|now)\b/g, '').trim();
  if (!query) return { action: { kind: 'unknown' }, say: "I didn't catch that." };

  return {
    action: { kind: 'search', query, autoplay: true },
    say: `Playing ${query}.`,
  };
}

/**
 * Accept a command that came from the model.
 *
 * Everything crossing this boundary is treated as untrusted: a playlist id
 * the model invented would otherwise become a query for a playlist that
 * does not exist, and an out-of-range choice would play the wrong song.
 * Anything that fails a check degrades to `unknown`, which the bubble
 * reports honestly instead of acting on.
 */
export function validateCommand(raw: unknown, ctx: VoiceContext): VoiceCommand {
  const fallback: VoiceCommand = {
    action: { kind: 'unknown' },
    say: "Sorry, I didn't understand that.",
  };
  if (!raw || typeof raw !== 'object') return fallback;

  const o = raw as Record<string, unknown>;
  const say = typeof o.say === 'string' && o.say.trim() ? o.say.trim().slice(0, 140) : '';
  const kind = typeof o.action === 'string' ? o.action : undefined;
  const shuffle = o.shuffle === true;

  switch (kind) {
    case 'play_playlist': {
      const id = typeof o.playlist_id === 'string' ? o.playlist_id : '';
      const found = ctx.playlists.find((p) => p.id === id);
      // A title can also be honoured, but only by resolving it back to a
      // real playlist — never by passing the string on.
      const byTitle =
        found ||
        (typeof o.playlist_title === 'string'
          ? matchPlaylist(o.playlist_title, ctx.playlists)
          : null);
      if (!byTitle) return fallback;
      return {
        action: { kind: 'play_playlist', playlistId: byTitle.id, shuffle },
        say: say || `Playing ${byTitle.title}.`,
      };
    }
    case 'play_liked':
      return { action: { kind: 'play_liked', shuffle }, say: say || 'Playing your liked songs.' };
    case 'play_all':
      return { action: { kind: 'play_all', shuffle }, say: say || 'Playing everything.' };
    case 'search': {
      const query = typeof o.query === 'string' ? o.query.trim().slice(0, 120) : '';
      if (!query) return fallback;
      const pickRaw = typeof o.pick === 'number' ? Math.round(o.pick) : undefined;
      const pick = pickRaw && pickRaw >= 1 && pickRaw <= 10 ? pickRaw : undefined;
      return {
        action: { kind: 'search', query, autoplay: o.autoplay === true || pick !== undefined, pick },
        say: say || `Searching for ${query}.`,
      };
    }
    case 'choose': {
      const n = typeof o.index === 'number' ? Math.round(o.index) : 0;
      if (n < 1 || n > ctx.pending.length) return fallback;
      return { action: { kind: 'choose', index: n }, say: say || 'Playing it.' };
    }
    case 'transport': {
      const op = o.op;
      if (op === 'pause' || op === 'resume' || op === 'next' || op === 'previous') {
        return { action: { kind: 'transport', op }, say: say || 'Done.' };
      }
      return fallback;
    }
    case 'shuffle':
      return {
        action: { kind: 'shuffle', on: o.on !== false },
        say: say || (o.on !== false ? 'Shuffle on.' : 'Shuffle off.'),
      };
    default:
      return say ? { action: { kind: 'unknown' }, say } : fallback;
  }
}
