'use client';

/**
 * News / Podcasts / Artists page — shared by all three.
 *
 * Leads with the videos from everything you follow (ChannelFeed), with the
 * channel strip at the bottom of that. Adding channels is behind a "+"
 * in the header so the search box isn't occupying the top of the page on
 * every visit, and discovery sits last.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search as SearchIcon, X, Plus, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { ChannelFeed } from '@/components/ui/ChannelFeed';
import { PodcastChannel, formatSubscribers } from '@/lib/podcasts';
import { channelMeta, type ChannelCategory } from '@/lib/channelCategory';
import { useFollowedChannels } from '@/store/followedChannels';
import { createClient } from '@/lib/supabase/client';

// Channels wrap top-to-bottom rather than scrolling sideways. A single
// horizontal row fitted four of them and left the whole lower half of the
// page empty, and everything past the fourth was invisible unless you
// happened to know it was there to swipe for.
const CHANNEL_GRID = 'grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 lg:grid-cols-8';

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
  const label = channelMeta(category).listLabel;
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
  icon: React.ElementType;
  action?: React.ReactNode;
}) {
  return (
    <div className="group relative text-center">
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
  const meta = channelMeta(category);
  const router = useRouter();
  const [featured, setFeatured] = useState<PodcastChannel[]>([]);
  /**
   * Artist names already in the library, offered as one-tap searches.
   *
   * There is no verified featured list for music (see FEATURED_ARTISTS), and
   * a plausible-looking wrong handle is worse than none. The artists you
   * already listen to are a better starting point than any list we could
   * guess at, and they cost no YouTube quota to produce.
   */
  const [fromLibrary, setFromLibrary] = useState<string[]>([]);
  const [results, setResults] = useState<PodcastChannel[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Only music has no featured list to fall back on, so this is the only
  // category that pays for the query.
  useEffect(() => {
    if (category !== 'music') return;
    let cancelled = false;
    createClient()
      .from('artists')
      .select('name')
      .limit(40)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const names = Array.from(
          new Set(
            (data as { name: string | null }[])
              .map((a) => a.name?.trim())
              .filter((n): n is string => Boolean(n)),
          ),
        ).slice(0, 12);
        setFromLibrary(names);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const searchFor = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setSearchOpen(true);
    setQuery(q);
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

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchFor(query);
  };

  // Arriving with ?q= — sent by the artist name under the player when the
  // channel behind a song could not be resolved. Read from location rather
  // than useSearchParams: this page is statically prerendered, and that
  // hook would force the whole page into a Suspense boundary for one
  // optional parameter. Deferred out of the effect body because searchFor
  // sets state, and runs once on mount so a later render cannot re-run a
  // search the user has since replaced.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')?.trim();
    if (!q) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url.pathname + url.search);
    const t = window.setTimeout(() => searchFor(q), 0);
    return () => window.clearTimeout(t);
  }, []);

  const { base, icon: Icon } = meta;

  return (
    <div className="space-y-8 p-6 animate-fade-in lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="mb-3 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-bold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        </div>
        <button
          onClick={() => setSearchOpen((o) => !o)}
          className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4" />
          {meta.addLabel}
        </button>
      </div>

      {searchOpen ? (
        <form onSubmit={runSearch} className="relative max-w-xl">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={meta.searchPlaceholder}
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
            <div className={CHANNEL_GRID}>
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className={CHANNEL_GRID}>
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

      {/* Videos first, with your channels at the bottom of this block. */}
      <ChannelFeed category={category} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{meta.discoverHeading}</h2>
        {loadingFeatured ? (
          <div className={CHANNEL_GRID}>
            {Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : featured.length > 0 ? (
          <div className={CHANNEL_GRID}>
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
        ) : fromLibrary.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Artists already in your library — tap one to find its channel.
            </p>
            <div className="flex flex-wrap gap-2">
              {fromLibrary.map((name) => (
                <button
                  key={name}
                  onClick={() => searchFor(name)}
                  className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Icon}
            title="Nothing to show"
            description={
              category === 'music'
                ? 'Search for an artist or label by name to add them.'
                : "Couldn't reach YouTube for the featured list."
            }
          />
        )}
      </section>
    </div>
  );
}
