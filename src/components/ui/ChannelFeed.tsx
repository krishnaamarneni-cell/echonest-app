'use client';

/**
 * Videos from the channels you follow — the whole point of News/Podcasts.
 *
 * Latest and Top come first, in list or grid; the channels themselves sit
 * at the BOTTOM as a compact strip. Opening News should show you something
 * to watch, not a row of logos you then have to click through.
 *
 * Shared by the Home tabs and the /news and /podcasts pages so they can't
 * diverge.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mic, Newspaper, ChevronRight } from 'lucide-react';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { VideoList, VideoItem } from '@/components/ui/VideoList';
import { episodeToSong } from '@/lib/podcasts';
import { usePlayerStore } from '@/store/player';
import { useFollowedChannels, ChannelCategory } from '@/store/followedChannels';

export function ChannelFeed({
  category,
  showBrowseLink = false,
}: {
  category: ChannelCategory;
  /** Home shows a "Browse all" link; the full page has its own + button. */
  showBrowseLink?: boolean;
}) {
  const [feed, setFeed] = useState<VideoItem[]>([]);
  const [feedKey, setFeedKey] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const play = usePlayerStore((s) => s.play);
  const currentSong = usePlayerStore((s) => s.currentSong);

  const load = useFollowedChannels((s) => s.load);
  const all = useFollowedChannels((s) => s.channels);
  const followed = all.filter((c) => c.category === category);

  const uploadsKey = followed
    .map((c) => c.uploads_playlist_id)
    .filter(Boolean)
    .join(',');

  // "Loading" means we haven't fetched for this exact set of channels yet,
  // derived so following a channel refreshes with no extra state.
  const loading = uploadsKey.length > 0 && feedKey !== uploadsKey;

  useEffect(() => {
    load();
  }, [load]);

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

  const base = category === 'news' ? '/news' : '/podcasts';
  const Icon = category === 'news' ? Newspaper : Mic;
  const plural = category === 'news' ? 'news channels' : 'podcasts';

  const latest = feed.slice(0, 30);
  const top = [...feed].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 12);

  const playFrom = (list: VideoItem[]) => (index: number) => {
    const songs = list.map((v) =>
      episodeToSong(
        {
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          thumbnail: v.thumbnail,
          publishedAt: v.publishedAt,
          duration: v.duration,
        },
        category,
      ),
    );
    play(songs[index], songs, 'library');
  };

  // Nothing followed yet — point at discovery rather than showing an
  // empty page.
  if (followed.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Latest</h2>
          <div className="flex items-center gap-2">
            {showBrowseLink ? (
              <Link
                href={base}
                className="flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Browse all
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
            <ViewToggle view={view} onChange={setViewMode} />
          </div>
        </div>
        {loading ? (
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

      {!loading && top.length > 0 ? (
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

      {/* Channels last — they're navigation, not the content. */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your {plural}</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {followed.map((c) => (
            <Link
              key={c.id}
              href={`${base}/${encodeURIComponent(c.handle)}`}
              className="w-20 shrink-0 text-center sm:w-24"
            >
              <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-card shadow-lg transition-transform hover:scale-105">
                {c.thumbnail ? (
                  <Image
                    src={c.thumbnail}
                    alt={c.title}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-semibold">{c.title}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
