import { create } from 'zustand';

// Per-device settings for tight Web-Audio room sync.
//  - enabled: use the Web-Audio engine for room playback (default on).
//  - nudgeMs: manual offset to cancel this device's output latency
//    (e.g. Bluetooth speakers add 150-300ms). Positive = play earlier.
const ENABLED_KEY = 'echonest-sync-mode';
const NUDGE_KEY = 'echonest-sync-nudge-ms';

interface SyncModeState {
  enabled: boolean;
  nudgeMs: number;
  hydrate: () => void;
  toggle: () => void;
  setNudge: (ms: number) => void;
}

export const useSyncMode = create<SyncModeState>((set) => ({
  enabled: true,
  nudgeMs: 0,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const enabledRaw = localStorage.getItem(ENABLED_KEY);
    const nudgeRaw = localStorage.getItem(NUDGE_KEY);
    set({
      enabled: enabledRaw === null ? true : enabledRaw === '1',
      nudgeMs: nudgeRaw ? Number(nudgeRaw) || 0 : 0,
    });
  },
  toggle: () =>
    set((s) => {
      const enabled = !s.enabled;
      if (typeof window !== 'undefined') localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
      return { enabled };
    }),
  setNudge: (ms) => {
    if (typeof window !== 'undefined') localStorage.setItem(NUDGE_KEY, String(ms));
    set({ nudgeMs: ms });
  },
}));
