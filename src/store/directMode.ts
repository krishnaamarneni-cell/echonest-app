import { create } from 'zustand';

// Per-device setting: stream audio straight from googlevideo instead of
// piping the bytes through the laptop proxy.
//
// Why this exists: the proxy runs on a home laptop whose *upload* is the
// bottleneck for everything (measured ~48 KB/s against Cloudflare, versus
// ~1.5 MB/s download — a 33:1 asymmetry). Normal playback makes every byte
// travel googlevideo -> laptop -> Cloudflare -> phone, so it has to squeeze
// through that uplink. A 128 kbps track needs ~16 KB/s sustained, which is
// marginal on a good day and hopeless while anything else is using the
// connection.
//
// Direct mode makes /audio return a 302 to googlevideo, so the phone pulls
// bytes over its OWN connection and the laptop only does the ~1s yt-dlp
// resolve. The uplink stops mattering entirely.
//
// Default OFF, because googlevideo URLs are resolved bound to the laptop's
// IP and a different device may get a 403 instead of the `ipbypass` redirect
// that grants access. That's device- and network-dependent, so it's opt-in:
// flip it on, play a song, and you know within seconds.
//
// Downloads deliberately ignore this — offline.ts must read the response
// body with fetch(), and googlevideo sends no CORS headers, so downloads
// always go through the proxy regardless of this setting.
const KEY = 'echonest-direct-mode';

interface DirectModeState {
  enabled: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useDirectMode = create<DirectModeState>((set) => ({
  enabled: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    set({ enabled: localStorage.getItem(KEY) === '1' });
  },
  toggle: () =>
    set((s) => {
      const enabled = !s.enabled;
      if (typeof window !== 'undefined') localStorage.setItem(KEY, enabled ? '1' : '0');
      return { enabled };
    }),
}));
