import { create } from 'zustand';

interface ListenAlongState {
  // null = not in a room; otherwise the active room's code
  roomCode: string | null;
  // true if this device created the room (the "DJ"). Hosts control
  // playback for everyone; non-hosts are read-only speakers.
  isHost: boolean;
  // Number of other participants seen in presence (best-effort)
  peerCount: number;
  // Set to true while we're applying an incoming remote event so the local
  // mutation doesn't get re-broadcast (would cause loops).
  suppressBroadcast: boolean;

  joinRoom: (code: string, asHost?: boolean) => void;
  leaveRoom: () => void;
  setPeerCount: (n: number) => void;
  setSuppressBroadcast: (v: boolean) => void;
}

export const useListenAlong = create<ListenAlongState>((set) => ({
  roomCode: null,
  isHost: false,
  peerCount: 0,
  suppressBroadcast: false,
  joinRoom: (code, asHost = false) => set({ roomCode: code, isHost: asHost }),
  leaveRoom: () => set({ roomCode: null, isHost: false, peerCount: 0 }),
  setPeerCount: (n) => set({ peerCount: n }),
  setSuppressBroadcast: (v) => set({ suppressBroadcast: v }),
}));
