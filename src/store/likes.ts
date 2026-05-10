import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

interface LikesState {
  likedIds: Set<string>;
  ytLikedVideoIds: Set<string>;
  loaded: boolean;
  loadLikes: () => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;
  toggleYouTubeLike: (
    videoId: string,
    title: string,
    author: string,
    thumbnail: string,
  ) => Promise<{ songId: string | null }>;
  isLiked: (songId: string) => boolean;
  isYouTubeLiked: (videoId: string) => boolean;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  likedIds: new Set(),
  ytLikedVideoIds: new Set(),
  loaded: false,

  loadLikes: async () => {
    if (get().loaded) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [likesRes, ytSongsRes] = await Promise.all([
      supabase.from('likes').select('song_id').eq('user_id', user.id),
      supabase
        .from('songs')
        .select('id, youtube_id')
        .eq('user_id', user.id)
        .eq('source', 'youtube_embed')
        .eq('youtube_kind', 'video'),
    ]);

    const likedSongIds = new Set(
      (likesRes.data || []).map((d: { song_id: string }) => d.song_id)
    );

    // Compute which YT video IDs are liked (= song exists AND is in likes)
    const ytLikedVideos = new Set<string>();
    for (const s of ytSongsRes.data || []) {
      if (s.youtube_id && likedSongIds.has(s.id)) {
        ytLikedVideos.add(s.youtube_id);
      }
    }

    set({
      likedIds: likedSongIds,
      ytLikedVideoIds: ytLikedVideos,
      loaded: true,
    });
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

  isYouTubeLiked: (videoId) => get().ytLikedVideoIds.has(videoId),

  toggleYouTubeLike: async (videoId, title, author, thumbnail) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { songId: null };

    const isCurrentlyLiked = get().ytLikedVideoIds.has(videoId);

    if (isCurrentlyLiked) {
      // Find the existing song record for this video
      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('user_id', user.id)
        .eq('source', 'youtube_embed')
        .eq('youtube_kind', 'video')
        .eq('youtube_id', videoId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', existing.id);
        set((s) => {
          const yt = new Set(s.ytLikedVideoIds);
          yt.delete(videoId);
          const liked = new Set(s.likedIds);
          liked.delete(existing.id);
          return { ytLikedVideoIds: yt, likedIds: liked };
        });
        return { songId: existing.id };
      }
      return { songId: null };
    }

    // Like — find or create the song record, then like it
    let songId: string | null = null;
    const { data: existing } = await supabase
      .from('songs')
      .select('id')
      .eq('user_id', user.id)
      .eq('source', 'youtube_embed')
      .eq('youtube_kind', 'video')
      .eq('youtube_id', videoId)
      .maybeSingle();

    if (existing) {
      songId = existing.id;
    } else {
      const { data: newSong } = await supabase
        .from('songs')
        .insert({
          user_id: user.id,
          title,
          artist_name: author,
          cover_url: thumbnail,
          file_url: '',
          duration: 0,
          source: 'youtube_embed',
          youtube_id: videoId,
          youtube_kind: 'video',
        })
        .select('id')
        .single();
      if (newSong) songId = newSong.id;
    }

    if (songId) {
      await supabase
        .from('likes')
        .insert({ user_id: user.id, song_id: songId });
      set((s) => {
        const yt = new Set(s.ytLikedVideoIds);
        yt.add(videoId);
        const liked = new Set(s.likedIds);
        liked.add(songId!);
        return { ytLikedVideoIds: yt, likedIds: liked };
      });
    }

    return { songId };
  },
}));
