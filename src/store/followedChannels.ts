import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import { PodcastChannel } from '@/lib/podcasts';

/**
 * Channels the user has added to News or Podcasts.
 *
 * The YouTube metadata is copied in at follow time, so rendering someone's
 * followed list costs no YouTube quota — only opening a channel to read its
 * episodes calls the API. Requires supabase-migration-followed-channels.sql.
 */

export type ChannelCategory = 'news' | 'podcast';

export interface FollowedChannel {
  id: string;
  channel_id: string;
  handle: string;
  title: string;
  thumbnail: string | null;
  uploads_playlist_id: string;
  category: ChannelCategory;
}

interface FollowedChannelsState {
  channels: FollowedChannel[];
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
  follow: (channel: PodcastChannel, category: ChannelCategory) => Promise<void>;
  unfollow: (channelId: string, category: ChannelCategory) => Promise<void>;
  isFollowed: (channelId: string, category: ChannelCategory) => boolean;
  byCategory: (category: ChannelCategory) => FollowedChannel[];
}

export const useFollowedChannels = create<FollowedChannelsState>((set, get) => ({
  channels: [],
  loaded: false,
  loading: false,

  load: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    const supabase = createClient();
    const { data } = await supabase
      .from('followed_channels')
      .select('id, channel_id, handle, title, thumbnail, uploads_playlist_id, category')
      .order('created_at', { ascending: false });
    set({
      channels: (data as FollowedChannel[]) || [],
      loaded: true,
      loading: false,
    });
  },

  follow: async (channel, category) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Optimistic insert with a temporary id so the button flips instantly;
    // replaced by load() below, and rolled back if the write fails.
    const optimistic: FollowedChannel = {
      id: `tmp-${channel.channelId}-${category}`,
      channel_id: channel.channelId,
      handle: channel.handle,
      title: channel.title,
      thumbnail: channel.thumbnail || null,
      uploads_playlist_id: channel.uploadsPlaylistId,
      category,
    };
    set((s) => ({ channels: [optimistic, ...s.channels] }));

    const { error } = await supabase.from('followed_channels').insert({
      user_id: user.id,
      channel_id: channel.channelId,
      handle: channel.handle,
      title: channel.title,
      thumbnail: channel.thumbnail || null,
      uploads_playlist_id: channel.uploadsPlaylistId,
      category,
    });

    if (error) {
      set((s) => ({ channels: s.channels.filter((c) => c.id !== optimistic.id) }));
      return;
    }
    await get().load(true);
  },

  unfollow: async (channelId, category) => {
    const previous = get().channels;
    set((s) => ({
      channels: s.channels.filter(
        (c) => !(c.channel_id === channelId && c.category === category),
      ),
    }));
    const supabase = createClient();
    const { error } = await supabase
      .from('followed_channels')
      .delete()
      .eq('channel_id', channelId)
      .eq('category', category);
    if (error) set({ channels: previous });
  },

  isFollowed: (channelId, category) =>
    get().channels.some((c) => c.channel_id === channelId && c.category === category),

  byCategory: (category) => get().channels.filter((c) => c.category === category),
}));
