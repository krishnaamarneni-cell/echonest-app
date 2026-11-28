import { create } from 'zustand';

const STORAGE_KEY = 'echonest-bg-mode';

interface BackgroundModeState {
  enabled: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
}

export const useBackgroundMode = create<BackgroundModeState>((set, get) => ({
  enabled: false,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      /**
       * Never chosen — so pick the default that actually plays.
       *
       * Podcasts and news reach the <audio> element on their own
       * (isWatchContent in AudioPlayer), but music only gets there when
       * this is on. With it off, a song falls back to a hidden 1x1
       * YouTube iframe, which cannot play in the background at all and
       * which VEVO and label channels refuse outright — so artist songs
       * silently did nothing while podcasts were fine.
       *
       * Off is the right default only where there is no extractor to
       * play through. When one is configured, on is.
       */
      const proxyConfigured = !!(
        process.env.NEXT_PUBLIC_YT_PROXY_URL && process.env.NEXT_PUBLIC_YT_PROXY_SECRET
      );
      if (proxyConfigured) {
        // Written down rather than left implicit, so it shows as on in
        // Settings and one tap turns it off for good.
        try {
          localStorage.setItem(STORAGE_KEY, '1');
        } catch {}
        set({ enabled: true, hydrated: true });
        return;
      }
    }

    set({ enabled: raw === '1', hydrated: true });
  },

  setEnabled: (v) => {
    if (typeof window !== 'undefined') {
      if (v) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    }
    set({ enabled: v });
  },

  toggle: () => {
    get().setEnabled(!get().enabled);
  },
}));
