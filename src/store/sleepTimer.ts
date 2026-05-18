import { create } from 'zustand';
import { usePlayerStore } from './player';

/**
 * Sleep timer: pause playback after N minutes. The store owns the
 * countdown so the timer keeps running even when the user navigates
 * away from Now Playing. We tick once per second via a JS interval
 * the store itself manages, so there's only ever one timer alive.
 */

interface SleepTimerState {
  /** seconds remaining until pause, or null when timer is off */
  remaining: number | null;
  /** internal — the setInterval handle so we can clear it */
  intervalId: number | null;
  start: (minutes: number) => void;
  cancel: () => void;
  /** "When current song ends" — special mode that ignores the clock */
  endOfTrack: boolean;
  setEndOfTrack: (v: boolean) => void;
}

export const useSleepTimer = create<SleepTimerState>((set, get) => ({
  remaining: null,
  intervalId: null,
  endOfTrack: false,

  start: (minutes) => {
    const existing = get().intervalId;
    if (existing !== null && typeof window !== 'undefined') {
      window.clearInterval(existing);
    }
    const seconds = Math.max(0, Math.floor(minutes * 60));
    set({ remaining: seconds, endOfTrack: false });
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      const cur = get().remaining;
      if (cur == null) return;
      if (cur <= 1) {
        // Pause + cleanup
        try { usePlayerStore.getState().pause(); } catch {}
        const intervalId = get().intervalId;
        if (intervalId !== null) window.clearInterval(intervalId);
        set({ remaining: null, intervalId: null });
        return;
      }
      set({ remaining: cur - 1 });
    }, 1000);
    set({ intervalId: id });
  },

  cancel: () => {
    const id = get().intervalId;
    if (id !== null && typeof window !== 'undefined') {
      window.clearInterval(id);
    }
    set({ remaining: null, intervalId: null, endOfTrack: false });
  },

  setEndOfTrack: (v) => {
    // Cancel any running clock when switching to end-of-track mode
    const id = get().intervalId;
    if (id !== null && typeof window !== 'undefined') {
      window.clearInterval(id);
    }
    set({ endOfTrack: v, remaining: null, intervalId: null });
  },
}));
