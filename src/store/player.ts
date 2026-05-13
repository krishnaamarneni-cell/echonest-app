import { create } from 'zustand';
import { Song, RepeatMode, QueueItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@/lib/supabase/client';
import { useListenAlong } from './listenAlong';

// When the user is in a listen-along room as a non-host (passive
// "speaker"), block any local mutation that would diverge from the
// host's broadcast. Remote events from ListenAlongSync set
// suppressBroadcast=true around the mutation, which we read here as a
// pass-through signal so the system can apply them.
function isListenerLocked() {
  if (typeof window === 'undefined') return false;
  try {
    const s = useListenAlong.getState();
    return !!s.roomCode && !s.isHost && !s.suppressBroadcast;
  } catch {
    return false;
  }
}

async function logRecentlyPlayed(song: Song) {
  // Skip ad-hoc YouTube playlist videos (they don't have a real DB id)
  if (song.id.startsWith('yt-')) return;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('recently_played').insert({
      song_id: song.id,
      user_id: user.id,
    });
  } catch {}
}

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
  isNowPlayingOpen: boolean;
  playbackRate: number;
  // When set, AudioPlayer will seek the audio element to this time on its
  // next render, then clear it. Used by listen-along to bring late joiners
  // (or drifted peers) to the host's current position.
  pendingSeek: number | null;

  play: (song: Song, queue?: Song[], source?: QueueItem['source']) => void;
  seekTo: (time: number) => void;
  clearPendingSeek: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  setPlaybackRate: (r: number) => void;
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
  isNowPlayingOpen: false,
  playbackRate: 1,
  pendingSeek: null,

  seekTo: (time) => set({ pendingSeek: time, progress: time }),
  clearPendingSeek: () => set({ pendingSeek: null }),

  openNowPlaying: () => set({ isNowPlayingOpen: true }),
  closeNowPlaying: () => set({ isNowPlayingOpen: false }),
  setPlaybackRate: (r) => set({ playbackRate: r }),

  play: (song, queueSongs, source = 'library') => {
    if (isListenerLocked()) return;
    const newQueue: QueueItem[] = queueSongs
      ? queueSongs.map((s) => ({ id: uuidv4(), song: s, source }))
      : [{ id: uuidv4(), song, source }];

    const idx = queueSongs
      ? newQueue.findIndex((q) => q.song.id === song.id)
      : 0;

    logRecentlyPlayed(song);

    set({
      currentSong: song,
      queue: newQueue,
      queueIndex: idx >= 0 ? idx : 0,
      isPlaying: true,
      progress: 0,
      isPlayerVisible: true,
    });
  },

  pause: () => { if (isListenerLocked()) return; set({ isPlaying: false }); },
  resume: () => { if (isListenerLocked()) return; set({ isPlaying: true }); },
  togglePlay: () => {
    if (isListenerLocked()) return;
    set((s) => ({ isPlaying: !s.isPlaying }));
  },

  next: () => {
    if (isListenerLocked()) return;
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

    logRecentlyPlayed(queue[nextIdx].song);
    set({
      currentSong: queue[nextIdx].song,
      queueIndex: nextIdx,
      isPlaying: true,
      progress: 0,
    });
  },

  previous: () => {
    if (isListenerLocked()) return;
    const { queue, queueIndex, progress } = get();
    if (queue.length === 0) return;

    if (progress > 3) {
      set({ progress: 0 });
      return;
    }

    const prevIdx = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    logRecentlyPlayed(queue[prevIdx].song);
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

  removeFromQueue: (id) => {
    const { queue, queueIndex } = get();
    const removeIdx = queue.findIndex((q) => q.id === id);
    if (removeIdx === -1) return;
    // Don't allow removing the currently playing song
    if (removeIdx === queueIndex) return;
    const newQueue = queue.filter((q) => q.id !== id);
    // If we removed an item before the current one, shift the index down
    const newIndex = removeIdx < queueIndex ? queueIndex - 1 : queueIndex;
    set({ queue: newQueue, queueIndex: newIndex });
  },

  clearQueue: () => set({ queue: [], queueIndex: -1 }),
  setIsPlaying: (v) => set({ isPlaying: v }),
}));
