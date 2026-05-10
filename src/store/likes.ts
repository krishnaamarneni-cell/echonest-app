import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

interface LikesState {
  likedIds: Set<string>;
  loaded: boolean;
  loadLikes: () => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;
  isLiked: (songId: string) => boolean;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  likedIds: new Set(),
  loaded: false,

  loadLikes: async () => {
    if (get().loaded) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('likes')
      .select('song_id')
      .eq('user_id', user.id);
    if (data) {
      set({
        likedIds: new Set(data.map((d: { song_id: string }) => d.song_id)),
        loaded: true,
      });
    }
  },

  toggleLike: async (songId) => {
    if (songId.startsWith('yt-')) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isCurrentlyLiked = get().likedIds.has(songId);

    // Optimistic update
    set((s) => {
      const newSet = new Set(s.likedIds);
      if (isCurrentlyLiked) newSet.delete(songId);
      else newSet.add(songId);
      return { likedIds: newSet };
    });

    if (isCurrentlyLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('song_id', songId)
        .eq('user_id', user.id);
      if (error) {
        // Revert
        set((s) => {
          const newSet = new Set(s.likedIds);
          newSet.add(songId);
          return { likedIds: newSet };
        });
      }
    } else {
      const { error } = await supabase
        .from('likes')
        .insert({ song_id: songId, user_id: user.id });
      if (error) {
        set((s) => {
          const newSet = new Set(s.likedIds);
          newSet.delete(songId);
          return { likedIds: newSet };
        });
      }
    }
  },

  isLiked: (songId) => get().likedIds.has(songId),
}));
