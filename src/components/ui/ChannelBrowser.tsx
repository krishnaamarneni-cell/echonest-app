'use client';

/**
 * News / Podcasts landing page — shared by both.
 *
 * Leads with VIDEOS rather than channel logos: a merged Latest feed across
 * everything you follow, a Top row ranked by views, then the channels
 * themselves as a compact strip underneath, then discovery. The point of
 * opening News is to watch something, not to admire a grid of logos.
 *
 * Adding channels is behind a "+" in the header so the search box isn't
 * occupying the top of the page every visit.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mic, Newspaper, Search as SearchIcon, X, Plus, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton, SongRowSkeleton } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { VideoList, VideoItem } from '@/components/ui/VideoList';
import { PodcastChannel, formatSubscribers, episodeToSong } from '@/lib/podcasts';
import { usePlayerStore } from '@/store/player';
import {
  useFollowedChannels,
  ChannelCategory,
  FollowedChannel,
} from '@/store/followedChannels';

/** Add / remove toggle shown on each channel avatar. */
function FollowButton({
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
  const label = category === 'news' ? 'News' : 'Podcasts';
  const text = followed ? `Remove from ${label}` : `Add to ${label}`;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (followed) unfollow(channel.channelId, category);
        else follow(channel, category);
      }}
      title={text}
      aria-label={text}
      className={`flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
        followed ? 'bg-accent text-white' : 'bg-black/60 text-white hover:bg-black/80'
      }`}
    >
      {followed ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Compact circular channel chip for the strips under the video rows. */
function ChannelChip({
  href,
  title,
  thumbnail,
  subtitle,
  icon: Icon,
  action,
}: {
  href: string;
  title: string;
  thumbnail: string | null;
  subtitle?: string;
  icon: typeof Mic;
  action?: React.ReactNode;
}) {
  return (
    <div className="group relative w-20 shrink-0 text-center sm:w-24">
      <Link href={href}>
        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-card shadow-lg transition-transform group-hover:scale-105">
          {thumbnail ? (
            <Image src={thumbnail} alt={title} fill sizes="96px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <p className="mt-2 truncate text-xs font-semibold">{title}</p>
        {subtitle ? (
          <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </Link>
      {action ? <div className="absolute -right-1 top-0">{action}</div> : null}
    </div>
  );
}

export function ChannelBrowser({
  category,
  heading,
  blurb,
}: {
  category: ChannelCategory;
  heading: string;
  blurb: string;
}) {
  const [featured, setFeatured] = useState<PodcastChannel[]>([]);
  const [results, setResults] = useState<PodcastChannel[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feed, setFeed] = useState<VideoItem[]>([]);
  const [feedKey, setFeedKey] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const play = usePlayerStore((s) => s.play);
  const currentSong = usePlayerStore((s) => s.currentSong);

  const followedAll = useFollowedChannels((s) => s.channels);
  const loadFollowed = useFollowedChannels((s) => s.load);
  const followed: FollowedChannel[] = followedAll.filter((c) => c.category === category);

  const uploadsKey = followed
    .map((c) => c.uploads_playlist_id)
    .filter(Boolean)
    .join(',');

  // Loading the feed is "we haven't fetched for this exact set of channels
  // yet" — derived so following a channel refreshes it with no extra state.
  const feedLoading = uploadsKey.length > 0 && feedKey !== uploadsKey;

  useEffect(() => {
    loadFollowed();
  }, [loadFollowed]);

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem('echonest-channel-view') : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('echonest-channel-view', v);
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/podcasts/channels?category=${category}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && Array.isArray(body?.channels)) {
          setFeatured(body.channels);
          setError(null);
        } else {
          setError(body?.error || `Couldn't load channels (${r.status})`);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadingFeatured(false));
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    if (!uploadsKey) return;
    let cancelled = false;
    fetch(`/api/podcasts/feed?uploads=${encodeURIComponent(uploadsKey)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        setFeed(r.ok && Array.isArray(body?.items) ? body.items : []);
      })
      .catch(() => !cancelled && setFeed([]))
      .finally(() => {
        if (!cancelled) setFeedKey(uploadsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [uploadsKey]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/podcasts/channels?q=${encodeURIComponent(q)}`);
      const body = await r.json().catch(() => null);
      setResults(r.ok && Array.isArray(body?.channels) ? body.channels : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const base = category === 'news' ? '/news' : '/podcasts';
  const Icon = category === 'news' ? Newspaper : Mic;
  const plural = category === 'news' ? 'news channels' : 'podcasts';

  const latest = feed.slice(0, 24);
  const top = [...feed].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 12);

  const playFrom = (list: VideoItem[]) => (index: number) => {
    const songs = list.map((v) =>
      episodeToSong({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
        publishedAt: v.publishedAt,
        duration: v.duration,
      }),
    );
    play(songs[index], songs, 'library');
  };

  const toChannelShape = (c: FollowedChannel): PodcastChannel => ({
    handle: c.handle,
    channelId: c.channel_id,
    title: c.title,
    description: '',
    thumbnail: c.thumbnail || '',
    subscriberCount: 0,
    uploadsPlaylistId: c.uploads_playlist_id,
  });

  return (
    <div className="space-y-8 p-6 animate-fade-in lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        </div>
        <button
          onClick={() => setSearchOpen((o) => !o)}
          className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4" />
          Add channel
        </button>
      </div>

      {searchOpen ? (
        <form onSubmit={runSearch} className="relative max-w-xl">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              category === 'news'
                ? 'Search channels — CNN, CNBC, NDTV...'
                : 'Search podcasts — Joe Rogan, Huberman...'
            }
            className="w-full rounded-full border border-white/10 bg-card py-3 pl-11 pr-11 text-sm outline-none focus:border-accent"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults(null);
              }}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </form>
      ) : null}

      {searchOpen && results ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Search results</h2>
          {searching ? (
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {results.map((c) => (
                <ChannelChip
                  key={c.channelId}
                  href={`${base}/${encodeURIComponent(c.handle)}`}
                  title={c.title}
                  thumbnail={c.thumbnail}
                  subtitle={formatSubscribers(c.subscriberCount)}
                  icon={Icon}
                  action={<FollowButton channel={c} category={category} />}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing found. Try the channel&apos;s exact name.
            </p>
          )}
        </section>
      ) : null}

      {/* Latest across everything you follow — the reason to open this page. */}
      {followed.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Latest</h2>
            <ViewToggle view={view} onChange={setViewMode} />
          </div>
          {feedLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <SongRowSkeleton key={i} />
              ))}
            </div>
          ) : latest.length > 0 ? (
            <VideoList
              items={latest}
              view={view}
              onPlay={playFrom(latest)}
              currentVideoId={currentSong?.youtube_id}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing new from your {plural} yet.
            </p>
          )}
        </section>
      ) : null}

      {!feedLoading && top.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Top right now</h2>
          <VideoList
            items={top}
            view={view}
            onPlay={playFrom(top)}
            currentVideoId={currentSong?.youtube_id}
            showViews
          />
        </section>
      ) : null}

      {followed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Your {plural}</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {followed.map((c) => (
              <ChannelChip
                key={c.id}
                href={`${base}/${encodeURIComponent(c.handle)}`}
                title={c.title}
                thumbnail={c.thumbnail}
                icon={Icon}
                action={<FollowButton channel={toChannelShape(c)} category={category} />}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          {category === 'news' ? 'Top news channels' : 'Top podcasts'}
        </h2>
        {loadingFeatured ? (
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : featured.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {featured.map((c) => (
              <ChannelChip
                key={c.channelId}
                href={`${base}/${encodeURIComponent(c.handle)}`}
                title={c.title}
                thumbnail={c.thumbnail}
                subtitle={formatSubscribers(c.subscriberCount)}
                icon={Icon}
                action={<FollowButton channel={c} category={category} />}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Icon}
            title="Nothing to show"
            description="Couldn't reach YouTube for the featured list."
          />
        )}
      </section>
    </div>
  );
}
