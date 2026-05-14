// Pick a healthy Invidious instance to use as the audio source for
// YouTube-backed songs. Public instances come and go (DMCA, downtime)
// so we fetch the live list and pick the fastest healthy one.
//
// API: https://api.invidious.io/instances.json

interface InvidiousInstance {
  uri: string;
  health: 'up' | 'down' | 'partial' | 'unknown';
  hasApi: boolean;
  latency: number; // ms
}

let cachedInstance: string | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

// Hardcoded fallback list — used if api.invidious.io is down. These are
// instances that have been historically reliable; verify periodically.
const FALLBACK_INSTANCES = [
  'https://invidious.f5.si',
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://inv.tux.pizza',
];

export async function pickInvidiousInstance(): Promise<string> {
  if (cachedInstance && Date.now() - cachedAt < CACHE_MS) {
    return cachedInstance;
  }
  try {
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=health,users');
    if (res.ok) {
      const raw = (await res.json()) as Array<[string, Record<string, unknown>]>;
      const healthy: InvidiousInstance[] = raw
        .filter((entry) => {
          const info = entry[1];
          // type guards for nested fields
          const monitor = info?.monitor as { '30dRatio'?: { ratio?: string | number } } | undefined;
          const ratio = Number(monitor?.['30dRatio']?.ratio ?? 0);
          return (
            info?.type === 'https' &&
            info?.api === true &&
            ratio >= 95
          );
        })
        .map((entry) => ({
          uri: entry[1].uri as string,
          health: 'up',
          hasApi: true,
          latency: 0,
        }));
      if (healthy.length > 0) {
        cachedInstance = healthy[0].uri;
        cachedAt = Date.now();
        return cachedInstance;
      }
    }
  } catch {}
  // Use first fallback if API call fails
  cachedInstance = FALLBACK_INSTANCES[0];
  cachedAt = Date.now();
  return cachedInstance;
}

// Build the audio URL for a given YouTube video ID using the
// currently-selected Invidious instance. itag=140 = m4a 128kbps, plays
// natively in Safari.
export function invidiousAudioUrl(instance: string, videoId: string): string {
  return `${instance.replace(/\/+$/, '')}/latest_version?id=${videoId}&itag=140`;
}

// On audio error, mark current instance bad and rotate to next fallback
export function rotateInstance(): string {
  const idx = cachedInstance ? FALLBACK_INSTANCES.indexOf(cachedInstance) : -1;
  const next = FALLBACK_INSTANCES[(idx + 1) % FALLBACK_INSTANCES.length];
  cachedInstance = next;
  cachedAt = Date.now();
  return next;
}
