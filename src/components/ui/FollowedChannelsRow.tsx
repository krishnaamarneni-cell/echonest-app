'use client';

/**
 * The channels you follow, plus a way to find more.
 *
 * Home's Podcasts tab only ever listed imported episodes, so with nothing
 * imported it showed a dead end ("No podcasts yet...") with no route to the
 * discovery pages. This puts the followed channels and a Browse button
 * right where people look for them.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mic, Newspaper, ChevronRight } from 'lucide-react';
import { useFollowedChannels, ChannelCategory } from '@/store/followedChannels';

export function FollowedChannelsRow({ category }: { category: ChannelCategory }) {
  // Loads itself so every page that drops this in just works — the store
  // no-ops if it has already loaded.
  const load = useFollowedChannels((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);

  // Select the raw array and filter OUTSIDE the selector. Filtering inside
  // returns a fresh array on every call, and zustand compares with Object.is
  // — so the store looks changed on every render, which re-renders, which
  // re-runs the selector: an infinite loop that crashes the tab.
  const all = useFollowedChannels((s) => s.channels);
  const channels = useMemo(
    () => all.filter((c) => c.category === category),
    [all, category],
  );

  const base = category === 'news' ? '/news' : '/podcasts';
  const Icon = category === 'news' ? Newspaper : Mic;
  const label = category === 'news' ? 'news channels' : 'podcasts';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          {channels.length > 0 ? `Your ${label}` : `Find ${label}`}
        </h2>
        <Link
          href={base}
          className="flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Browse all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {channels.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {channels.map((c) => (
            <Link
              key={c.id}
              href={`${base}/${encodeURIComponent(c.handle)}`}
              className="w-24 shrink-0 text-center sm:w-28"
            >
              <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-card shadow-lg transition-transform hover:scale-105">
                {c.thumbnail ? (
                  <Image
                    src={c.thumbnail}
                    alt={c.title}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-semibold">{c.title}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          href={base}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-card p-4 transition-colors hover:bg-card-hover"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {category === 'news' ? 'Browse news channels' : 'Browse podcasts'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {category === 'news'
                ? 'CNN, CNBC, NDTV and more — add any channel to your list'
                : 'Joe Rogan, Huberman and more — add any show to your list'}
            </p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </section>
  );
}
