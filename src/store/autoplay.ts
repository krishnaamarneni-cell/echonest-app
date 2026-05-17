import { create } from 'zustand';

const STORAGE_KEY = 'echonest-autoplay';

interface AutoplayState {
  /** When ON, YouTube songs auto-extend the queue with algorithmic recommendations. */
  enabled: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
}

export const useAutoplay = create<AutoplayState>((set, get) => ({
  enabled: false,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY) === '1';
    set({ enabled: stored, hydrated: true });
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
