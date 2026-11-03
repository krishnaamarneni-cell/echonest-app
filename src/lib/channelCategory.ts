/**
 * The three kinds of YouTube channel EchoNest follows.
 *
 * News, podcasts and artists are the same thing underneath — a channel
 * whose uploads you want to listen to — so they share one table, one API
 * and one set of components. What differs between them is wording, routing
 * and how the uploads should be read, and all of that lives here rather
 * than as a ternary in each component. Adding 'music' as a third category
 * is what turned those ternaries into a table: `category === 'news' ? a :
 * b` silently treats a new third case as news.
 *
 * Icons are included even though this is a lib file. They are the one piece
 * of per-category knowledge that is unavoidably visual, and splitting them
 * into a parallel map in components/ would mean two places to edit for one
 * new category — exactly the mistake this file exists to prevent.
 */

import { Mic, Newspaper, Music2, type LucideIcon } from 'lucide-react';

export type ChannelCategory = 'news' | 'podcast' | 'music';

export interface ChannelCategoryMeta {
  /** Route prefix: a channel lives at `${base}/${handle}`. */
  base: string;
  /** One of them, for a label above a title. */
  label: string;
  /** The list it is added to, as the button says it. */
  listLabel: string;
  /** Plural, lower case, for sentences. */
  plural: string;
  /** The button that opens the search box. */
  addLabel: string;
  icon: LucideIcon;
  /** Heading above the uploads. */
  itemsHeading: string;
  /** The big play button. */
  playLabel: string;
  searchPlaceholder: string;
  discoverHeading: string;
  /**
   * How a channel's uploads should be read.
   *
   * Artists want their best, not their newest — a music channel's recent
   * uploads are as likely to be a teaser as a song — so music ranks by
   * views and drops anything that does not look like a track.
   */
  rankByViews: boolean;
  songsOnly: boolean;
  /**
   * Shortest upload worth keeping, in seconds. 181 drops Shorts, which
   * YouTube caps at three minutes. Songs cannot use that number: plenty of
   * real tracks are under three minutes, so music uses a threshold that
   * only catches the genuine 60-second clip.
   */
  minDurationSeconds: number;
  /** What a played upload is stored as, which decides audio vs video. */
  contentType: 'news' | 'podcast' | 'music';
}

export const CHANNEL_CATEGORIES: Record<ChannelCategory, ChannelCategoryMeta> = {
  news: {
    base: '/news',
    label: 'News',
    listLabel: 'News',
    plural: 'news channels',
    addLabel: 'Add channel',
    icon: Newspaper,
    itemsHeading: 'Latest videos',
    playLabel: 'Play latest',
    searchPlaceholder: 'Search channels — CNN, CNBC, NDTV...',
    discoverHeading: 'Discover news channels',
    rankByViews: false,
    songsOnly: false,
    minDurationSeconds: 181,
    contentType: 'news',
  },
  podcast: {
    base: '/podcasts',
    label: 'Podcast',
    listLabel: 'Podcasts',
    plural: 'podcasts',
    addLabel: 'Add podcast',
    icon: Mic,
    itemsHeading: 'Latest episodes',
    playLabel: 'Play latest',
    searchPlaceholder: 'Search podcasts — Joe Rogan, Huberman...',
    discoverHeading: 'Discover podcasts',
    rankByViews: false,
    songsOnly: false,
    minDurationSeconds: 181,
    contentType: 'podcast',
  },
  music: {
    base: '/artists',
    label: 'Artist',
    listLabel: 'Artists',
    plural: 'artists',
    addLabel: 'Add artist',
    icon: Music2,
    itemsHeading: 'Top songs',
    playLabel: 'Play top songs',
    searchPlaceholder: 'Search artists — Anirudh, Aditya Music, T-Series...',
    discoverHeading: 'Discover artists',
    rankByViews: true,
    songsOnly: true,
    minDurationSeconds: 70,
    contentType: 'music',
  },
};

export function channelMeta(category: ChannelCategory): ChannelCategoryMeta {
  return CHANNEL_CATEGORIES[category] ?? CHANNEL_CATEGORIES.podcast;
}
