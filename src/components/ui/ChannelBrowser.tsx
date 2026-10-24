'use client';

/**
 * Browse and follow YouTube channels — shared by /news and /podcasts.
 *
 * Three stacked sections: the channels you've added, a curated featured
 * row, then search results once you search. Search covers every channel on
 * YouTube, and each result carries an add/remove toggle so a channel can be
 * followed from wherever you found it.
 *
 * Both categories render through this one component so News and Podcasts
 * can't drift apart in behaviour.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mic, Newspaper, Search as SearchIcon, X, Plus, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { PodcastChannel, formatSubscribers } from '@/lib/podcasts';
import {
  useFollowedChannels,
  ChannelCategory,
  FollowedChannel,
} from '@/store/followedChannels';

function ChannelCard({
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
    <div className="group relative">
      <Link href={href}>
        <div className="relative aspect-square overflow-hidden rounded-full bg-card shadow-lg transition-transform group-hover:scale-[1.03]">
          {thumbnail ? (
            <Image src={thumbnail} alt={title} fill sizes="200px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <p className="mt-2 truncate text-sm font-semibold">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </Link>
      {action ? <div className="absolute right-1 top-1">{action}</div> : null}
    </div>
  );
}

/** Add / remove toggle shown on each card. */
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
      className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
        followed ? 'bg-accent text-white' : 'bg-black/60 text-white hover:bg-black/80'
      }`}
    >
      {followed ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4';

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
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followedAll = useFollowedChannels((s) => s.channels);
  const loadFollowed = useFollowedChannels((s) => s.load);
  const followed: FollowedChannel[] = followedAll.filter((c) => c.category === category);

  useEffect(() => {
    loadFollowed();
  }, [loadFollowed]);

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
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category]);

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
  const plural = category === 'news' ? 'news' : 'podcasts';

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
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>

      <form onSubmit={runSearch} className="relative max-w-xl">
        <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
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

      {results ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Search results</h2>
          {searching ? (
            <div className={GRID}>
              {Array.from({ length: 5 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className={GRID}>
              {results.map((c) => (
                <ChannelCard
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

      {followed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Your {plural}</h2>
          <div className={GRID}>
            {followed.map((c) => (
              <ChannelCard
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
        <h2 className="text-xl font-bold">
          {category === 'news' ? 'Top news channels' : 'Top podcasts'}
        </h2>
        {loading ? (
          <div className={GRID}>
            {Array.from({ length: 10 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : featured.length > 0 ? (
          <div className={GRID}>
            {featured.map((c) => (
              <ChannelCard
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
