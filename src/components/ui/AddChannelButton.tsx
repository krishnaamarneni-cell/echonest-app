'use client';

/**
 * Compact "Add to News" / "Add to Podcasts" pill.
 *
 * Used where a channel shows up outside the News/Podcasts pages — search
 * results especially — so a channel can be filed into either list from
 * wherever it was found. The category is spelled out rather than implied by
 * an icon, because the whole point is choosing which list it goes to.
 */

import { Plus, Check } from 'lucide-react';
import { PodcastChannel } from '@/lib/podcasts';
import { useFollowedChannels, ChannelCategory } from '@/store/followedChannels';
import { channelMeta } from '@/lib/channelCategory';

export function AddChannelButton({
  channel,
  category,
}: {
  channel: PodcastChannel;
  category: ChannelCategory;
}) {
  const follow = useFollowedChannels((s) => s.follow);
  const unfollow = useFollowedChannels((s) => s.unfollow);
  const followed = useFollowedChannels((s) =>
    s.channels.some((c) => c.channel_id === channel.channelId && c.category === category),
  );

  // From the category table, not a ternary: with two categories spelled
  // out by hand a third one silently rendered as "Pod", so adding an
  // artist from search offered to file them under Podcasts.
  const full = channelMeta(category).listLabel;
  const label = category === 'podcast' ? 'Pod' : full;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (followed) unfollow(channel.channelId, category);
        else follow(channel, category);
      }}
      title={followed ? `Remove from ${full}` : `Add to ${full}`}
      aria-label={followed ? `Remove from ${full}` : `Add to ${full}`}
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
        followed
          ? 'bg-accent text-white'
          : 'border border-white/15 text-muted-foreground hover:bg-white/10 hover:text-foreground'
      }`}
    >
      {followed ? <Check className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
      {label}
    </button>
  );
}
