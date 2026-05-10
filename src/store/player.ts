import { create } from 'zustand';
import { Song, RepeatMode, QueueItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface PlayerState {
  currentSong: Song | null;
  queue: QueueItem[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlayerVisible: boolean;

  play: (song: Song, queue?: Song[], source?: QueueItem['source']) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setIsPlaying: (v: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  volume: 0.8,
  isMuted: false,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  isPlayerVisible: false,

  play: (song, queueSongs, source = 'library') => {
    const newQueue: QueueItem[] = queueSongs
      ? queueSongs.map((s) => ({ id: uuidv4(), song: s, source }))
      : [{ id: uuidv4(), song, source }];

    const idx = queueSongs
      ? newQueue.findIndex((q) => q.song.id === song.id)
      : 0;

    set({
      currentSong: song,
      queue: newQueue,
      queueIndex: idx >= 0 ? idx : 0,
      isPlaying: true,
      progress: 0,
      isPlayerVisible: true,
    });
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  next: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (queue.length === 0) return;

    let nextIdx: number;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
    }

    if (nextIdx >= queue.length) {
      if (repeat === 'all') {
        nextIdx = 0;
      } else {
        set({ isPlaying: false });
        return;
      }
    }

    set({
      currentSong: queue[nextIdx].song,
      queueIndex: nextIdx,
      isPlaying: true,
      progress: 0,
    });
  },

  previous: () => {
    const { queue, queueIndex, progress } = get();
    if (queue.length === 0) return;

    if (progress > 3) {
      set({ progress: 0 });
      return;
    }

    const prevIdx = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    set({
      currentSong: queue[prevIdx].song,
      queueIndex: prevIdx,
      isPlaying: true,
      progress: 0,
    });
  },

  setVolume: (v) => set({ volume: v, isMuted: v === 0 }),
  toggleMute: () =>
    set((s) => ({ isMuted: !s.isMuted })),
  setProgress: (p) => set({ progress: p }),
  setDuration: (d) => set({ duration: d }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({
      repeat:
        s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),

  addToQueue: (song) =>
    set((s) => ({
      queue: [...s.queue, { id: uuidv4(), song, source: 'queue' }],
    })),

  removeFromQueue: (id) =>
    set((s) => ({
      queue: s.queue.filter((q) => q.id !== id),
    })),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),
  setIsPlaying: (v) => set({ isPlaying: v }),
}));
