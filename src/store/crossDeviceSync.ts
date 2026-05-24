import { create } from 'zustand';

// Opt-in toggle (per device) for syncing the player across this account's
// devices. Off by default so the shared public library doesn't sync random
// visitors to each other — the owner turns it on where they want it.
const KEY = 'echonest-cross-device-sync';

interface CrossDeviceSyncState {
  enabled: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useCrossDeviceSync = create<CrossDeviceSyncState>((set) => ({
  enabled: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    set({ enabled: localStorage.getItem(KEY) === '1' });
  },
  toggle: () =>
    set((s) => {
      const enabled = !s.enabled;
      if (typeof window !== 'undefined') {
        localStorage.setItem(KEY, enabled ? '1' : '0');
      }
      return { enabled };
    }),
}));
