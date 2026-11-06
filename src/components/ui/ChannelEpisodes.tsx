'use client';

/**
 * One channel's uploads — shared by /podcasts/[handle], /news/[handle] and
 * /artists/[handle].
 *
 * Items come from the channel's uploads playlist (see
 * /api/podcasts/episodes), which is always complete and already ordered
 * newest-first, and are converted to ad-hoc Songs so the existing player
 * handles them with no special casing.
 *
 * An artist channel reads that same playlist differently: ranked by plays
 * rather than recency, with trailers, teasers and interviews dropped, so
 * the page reads as a discography rather than a feed. Those differences
 * are parameters on one fetch, not a second component — see
 * lib/channelCategory.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Play, Plus, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { VideoList } from '@/components/ui/VideoList';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { BulkDownloadButton } from '@/components/ui/BulkDownloadButton';
import { usePlayerStore } from '@/store/player';
import { PodcastEpisode, episodeToSong } from '@/lib/podcasts';
import { channelMeta, type ChannelCategory } from '@/lib/channelCategory';
import { useFollowedChannels } from '@/store/followedChannels';

export function ChannelEpisodes({
  handle,
  category,
}: {
  handle: string;
  category: ChannelCategory;
}) {
  const meta = channelMeta(category);
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const currentSong = usePlayerStore((s) => s.currentSong);

  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [title, setTitle] = useState('');
  const [thumb, setThumb] = useState('');
  const [channelId, setChannelId] = useState('');
  const [uploads, setUploads] = useState('');
  const [loadedHandle, setLoadedHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'grid'>('list');

  // Derived rather than stored: we're loading until the fetch for THIS
  // handle has settled, so switching channels shows a skeleton again with
  // no state to reset.
  const loading = loadedHandle !== handle;

  const follow = useFollowedChannels((s) => s.follow);
  const unfollow = useFollowedChannels((s) => s.unfollow);
  const loadFollowed = useFollowedChannels((s) => s.load);
  const followed = useFollowedChannels((s) =>
    s.channels.some((c) => c.channel_id === channelId && c.category === category),
  );

  useEffect(() => {
    loadFollowed();
  }, [loadFollowed]);

  // Shares the key with the News/Podcasts feeds so the choice carries across.
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
    if (!handle) return;
    let cancelled = false;
    const params = new URLSearchParams({ handle, max: '40' });
    // Sent only where they differ from the defaults, so news and podcasts
    // make exactly the request they always did.
    if (meta.rankByViews) params.set('sort', 'views');
    if (meta.songsOnly) params.set('songs', '1');
    if (meta.minDurationSeconds !== 181) {
      params.set('min', String(meta.minDurationSeconds));
    }

    fetch(`/api/podcasts/episodes?${params.toString()}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && Array.isArray(body?.episodes)) {
          setEpisodes(body.episodes);
          setTitle(body.channelTitle || handle);
          setThumb(body.channelThumb || '');
          setChannelId(body.channelId || '');
          setUploads(body.uploadsPlaylistId || '');
          setError(null);
        } else {
          setError(body?.error || `Couldn't load episodes (${r.status})`);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => {
        if (!cancelled) setLoadedHandle(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, meta.rankByViews, meta.songsOnly, meta.minDurationSeconds]);

  /**
   * The same conversion the player gets, reused by the download button.
   *
   * Only an artist's uploads are ever downloadable — episodeToSong stamps
   * them `content_type: 'music'`, and `isDownloadable` rejects podcast and
   * news. So this needs no category check: on those two pages the button
   * finds nothing eligible and renders nothing.
   */
  const songs = useMemo(
    () => episodes.map((e) => episodeToSong(e, meta.contentType)),
    [episodes, meta.contentType],
  );

  const playFrom = (index: number) => {
    play(songs[index], songs, 'library');
  };

  const Icon = meta.icon;

  const toggleFollow = () => {
    if (!channelId || !uploads) return;
    if (followed) {
      unfollow(channelId, category);
    } else {
      follow(
        {
          handle,
          channelId,
          title,
          description: '',
          thumbnail: thumb,
          subscriberCount: 0,
          uploadsPlaylistId: uploads,
        },
        category,
      );
    }
  };

  return (
    <div className="space-y-6 p-6 animate-fade-in lg:p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-card shadow-lg sm:h-32 sm:w-32">
          {thumb ? (
            <Image src={thumb} alt={title} fill sizes="128px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {meta.label}
          </p>
          <h1 className="truncate text-2xl font-bold sm:text-4xl">{title || handle}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {episodes.length > 0 ? (
              <button
                onClick={() => playFrom(0)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
              >
                <Play className="h-4 w-4 fill-current" />
                {meta.playLabel}
              </button>
            ) : null}
            {channelId && uploads ? (
              <button
                onClick={toggleFollow}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
                  followed
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                {followed ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {followed ? `In ${meta.listLabel}` : `Add to ${meta.listLabel}`}
              </button>
            ) : null}
            <BulkDownloadButton songs={songs} className="rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{meta.itemsHeading}</h2>
        {episodes.length > 0 ? <ViewToggle view={view} onChange={setViewMode} /> : null}
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <SongRowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : episodes.length > 0 ? (
        <VideoList
          items={episodes}
          view={view}
          onPlay={playFrom}
          currentVideoId={currentSong?.youtube_id}
          showChannel={false}
        />
      ) : (
        <EmptyState
          icon={Icon}
          title={meta.songsOnly ? 'No songs here' : 'Nothing published'}
          description={
            meta.songsOnly
              ? 'Nothing on this channel looked like a song — it may post only trailers and interviews.'
              : 'This channel has no uploads we can read.'
          }
        />
      )}
    </div>
  );
}
