/**
 * Parse LRC-format lyrics into a list of {time, text} cues.
 *
 * LRC looks like:
 *   [00:12.34]First line
 *   [00:15.78]Second line
 *   [00:20.00]
 *
 * Multiple timestamps on one line and metadata tags ([ar:...]) are
 * handled. Empty-text cues are kept so the UI can render a quiet
 * blank line during instrumental sections.
 */

export interface LyricCue {
  time: number; // seconds
  text: string;
}

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_RE = /^\[(ar|ti|al|au|length|by|offset|re|ve):/i;

export function parseLrc(lrc: string): LyricCue[] {
  if (!lrc) return [];
  const cues: LyricCue[] = [];
  const lines = lrc.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (META_RE.test(line)) continue;

    // Collect all timestamps on this line, then strip them out to get
    // the actual text.
    const timestamps: number[] = [];
    let m: RegExpExecArray | null;
    TIMESTAMP_RE.lastIndex = 0;
    while ((m = TIMESTAMP_RE.exec(line))) {
      const mins = Number(m[1]);
      const secs = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      timestamps.push(mins * 60 + secs + frac);
    }
    if (timestamps.length === 0) continue;
    const text = line.replace(TIMESTAMP_RE, '').trim();
    for (const t of timestamps) {
      cues.push({ time: t, text });
    }
  }
  cues.sort((a, b) => a.time - b.time);
  return cues;
}

/**
 * Find the index of the cue that should be highlighted at `currentTime`.
 * Returns -1 if currentTime is before the first cue. Binary search since
 * cues come in already sorted.
 */
export function findActiveCue(cues: LyricCue[], currentTime: number): number {
  if (cues.length === 0) return -1;
  if (currentTime < cues[0].time) return -1;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].time <= currentTime) {
      // mid is candidate; look to the right for a tighter fit
      if (mid === cues.length - 1 || cues[mid + 1].time > currentTime) {
        return mid;
      }
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}
