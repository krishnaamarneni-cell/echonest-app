import { create } from 'zustand';

const STORAGE_KEY = 'echonest-owner-mode';

interface OwnerModeState {
  isOwner: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setOwner: (v: boolean) => void;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
}

export const useOwnerMode = create<OwnerModeState>((set) => ({
  isOwner: false,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY) === '1';
    set({ isOwner: stored, hydrated: true });
  },

  setOwner: (v) => {
    if (typeof window !== 'undefined') {
      if (v) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    }
    set({ isOwner: v });
  },

  unlock: async (password) => {
    try {
      const res = await fetch('/api/owner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, '1');
        }
        set({ isOwner: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  lock: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ isOwner: false });
  },
}));
