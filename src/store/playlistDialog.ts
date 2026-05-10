import { create } from 'zustand';

export interface AddTarget {
  // Either an existing song id …
  songId?: string;
  // … or a YouTube video that needs to be persisted first
  youtubeVideo?: {
    videoId: string;
    title: string;
    author: string;
    thumbnail: string;
  };
  // For UI label
  displayTitle: string;
}

interface PlaylistDialogState {
  isOpen: boolean;
  target: AddTarget | null;
  open: (target: AddTarget) => void;
  close: () => void;
}

export const usePlaylistDialog = create<PlaylistDialogState>((set) => ({
  isOpen: false,
  target: null,
  open: (target) => set({ isOpen: true, target }),
  close: () => set({ isOpen: false, target: null }),
}));
