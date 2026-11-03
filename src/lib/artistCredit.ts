/**
 * Reading the artist line on a song.
 *
 * `song.artist_name` is not always one artist. A song that came from a
 * YouTube Mix carries whatever YouTube printed under the title, and for a
 * track with several credits that is a *summary*, not a name:
 *
 *   "Divo Music and 3 more"      -> one name we have, three we don't
 *   "Anirudh Ravichander, Dhanush"
 *   "Sid Sriram & Jonita Gandhi"
 *   "Shreya Ghoshal - Topic"     -> an auto-generated channel
 *
 * Treating the whole string as a single artist is what made tapping it open
 * one label's channel when the song credited four people. So the line gets
 * split into the names it actually contains, plus a count of the names
 * YouTube kept to itself — those can only come from a second lookup
 * (see /api/youtube/credits), and may not come at all.
 */

export interface ArtistCredit {
  /** Names we can act on right now, in the order they were credited. */
  names: string[];
  /** How many further names the line says exist without naming them. */
  hiddenCount: number;
}

/**
 * "… and 3 more" / "… & 3 more" / "…, and 3 more" — YouTube's way of
 * truncating a long credit. The count is the whole point: it tells the
 * picker how many names are still missing.
 */
const AND_N_MORE = /[,\s]*(?:and|&)\s+(\d+)\s+more\s*$/i;

/** Auto-generated YouTube Music channels are "<artist> - Topic". */
const TOPIC_SUFFIX = /\s*[-–]\s*Topic\s*$/i;

/**
 * Separators that reliably mean "another artist".
 *
 * A bare " and " is deliberately NOT one of them: "Florence and the
 * Machine" and "Simon and Garfunkel" are single acts, and splitting them
 * would invent artists that do not exist. The only "and" this file trusts
 * is the one in the "and N more" marker above, which is stripped first.
 */
const SEPARATORS = /\s*(?:,|&|·|\|| x |\/\/)\s*|\s+(?:feat\.?|ft\.?|featuring|with)\s+/i;

/** Credits that name no one in particular and are not worth a tap. */
const PLACEHOLDER = /^(?:various artists|unknown artist|youtube|topic|va)$/i;

export function parseArtistCredit(raw: string | null | undefined): ArtistCredit {
  const line = (raw || '').trim();
  if (!line) return { names: [], hiddenCount: 0 };

  let hiddenCount = 0;
  const truncated = line.replace(AND_N_MORE, (_m, n: string) => {
    hiddenCount = Number(n) || 0;
    return '';
  });

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of truncated.split(SEPARATORS)) {
    const name = part.replace(TOPIC_SUFFIX, '').trim();
    if (!name || PLACEHOLDER.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return { names, hiddenCount };
}

/**
 * Does this credit need a picker, or can a tap go straight through?
 *
 * One name and nothing hidden is the common case — a single artist, one
 * obvious destination, no sheet in the way.
 */
export function isMultiArtist(credit: ArtistCredit): boolean {
  return credit.names.length > 1 || credit.hiddenCount > 0;
}

/** Merge names found later (from a credits lookup) into what we had. */
export function mergeNames(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((n) => n.toLowerCase()));
  const merged = [...existing];
  for (const name of incoming) {
    const clean = name.replace(TOPIC_SUFFIX, '').trim();
    if (!clean || PLACEHOLDER.test(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged;
}
