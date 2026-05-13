import { create } from 'zustand';

interface ListenAlongState {
  // null = not in a room; otherwise the active room's code
  roomCode: string | null;
  // Number of other participants seen in presence (best-effort)
  peerCount: number;
  // Set to true while we're applying an incoming remote event so the local
  // mutation doesn't get re-broadcast (would cause loops).
  suppressBroadcast: boolean;

  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  setPeerCount: (n: number) => void;
  setSuppressBroadcast: (v: boolean) => void;
}

export const useListenAlong = create<ListenAlongState>((set) => ({
  roomCode: null,
  peerCount: 0,
  suppressBroadcast: false,
  joinRoom: (code) => set({ roomCode: code }),
  leaveRoom: () => set({ roomCode: null, peerCount: 0 }),
  setPeerCount: (n) => set({ peerCount: n }),
  setSuppressBroadcast: (v) => set({ suppressBroadcast: v }),
}));
