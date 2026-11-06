/**
 * Tab strips that reorder themselves around what you actually open.
 *
 * Home and Library both show the same six or seven sections in a fixed
 * order that was decided once, by hand. If you live in Songs, Artists and
 * News, three of your four most-used sections sit off the right edge of a
 * phone screen behind a horizontal scroll. This moves them to the front.
 *
 * Two rules keep it from being annoying:
 *
 *  1. THE ORDER IS FROZEN FOR THE SESSION. It is read once on mount and
 *     does not change again until the next visit. Sorting live would move
 *     a tab out from under the finger that just tapped it, and on a phone
 *     the following tap would land on whatever slid into its place.
 *
 *  2. NO HISTORY MEANS NO CHANGE. Unused tabs score zero and fall back to
 *     the order they were declared in, so a fresh install looks exactly
 *     the way it was designed to look.
 *
 * Counts live in localStorage, per device. That is the right scope: the
 * phone and the laptop genuinely do get used differently, and this is a
 * convenience, not data worth a table and a round trip.
 */

const KEY_PREFIX = 'echonest-tab-use:';

/** Halve every count once a tab has not been opened for this long. */
const DECAY_AFTER_MS = 45 * 24 * 60 * 60 * 1000;

export type TabSection = 'home' | 'library';

interface TabUse {
  count: number;
  /** epoch ms of the last open, used to break ties and to decay */
  last: number;
}

type UseMap = Record<string, TabUse>;

function read(section: TabSection): UseMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + section);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    // Hand-edited or half-written storage should not take the page down.
    const out: UseMap = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const row = v as { count?: unknown; last?: unknown };
      const count = Number(row?.count);
      const last = Number(row?.last);
      if (Number.isFinite(count) && count > 0) {
        out[id] = { count, last: Number.isFinite(last) ? last : 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(section: TabSection, map: UseMap): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + section, JSON.stringify(map));
  } catch {
    // Private mode, or the quota is full. The strip just keeps its
    // declared order — losing the preference is not worth an error.
  }
}

/**
 * Note that a tab was opened.
 *
 * Call it from the click handler, not from a tab-changed effect: the app
 * selects tabs programmatically in a few places (jumping to Albums after
 * an import, for instance) and those are the app's choice, not a signal
 * about what the user reaches for.
 */
export function recordTabUse(section: TabSection, id: string): void {
  if (typeof window === 'undefined') return;
  const map = read(section);
  const now = Date.now();
  const prev = map[id];

  // A tab you have stopped opening should drift back down rather than
  // hold its place forever on the strength of one heavy week.
  if (prev && prev.last && now - prev.last > DECAY_AFTER_MS) {
    for (const row of Object.values(map)) row.count = Math.max(1, Math.round(row.count / 2));
  }

  map[id] = { count: (map[id]?.count || 0) + 1, last: now };
  write(section, map);
}

/**
 * The declared tabs, most-opened first.
 *
 * `pinned` ids keep their declared position no matter what — Home's "All"
 * is the landing view, and a landing view that has wandered into fifth
 * place reads as a bug rather than a preference.
 */
export function orderTabsByUse<T extends { id: string }>(
  section: TabSection,
  tabs: readonly T[],
  pinned: readonly string[] = [],
): T[] {
  const map = read(section);
  const declared = new Map(tabs.map((t, i) => [t.id, i]));

  return [...tabs].sort((a, b) => {
    const aPin = pinned.includes(a.id);
    const bPin = pinned.includes(b.id);
    if (aPin !== bPin) return aPin ? -1 : 1;
    if (aPin && bPin) return declared.get(a.id)! - declared.get(b.id)!;

    const ua = map[a.id];
    const ub = map[b.id];
    const ca = ua?.count || 0;
    const cb = ub?.count || 0;
    if (ca !== cb) return cb - ca;

    const la = ua?.last || 0;
    const lb = ub?.last || 0;
    if (la !== lb) return lb - la;

    return declared.get(a.id)! - declared.get(b.id)!;
  });
}
