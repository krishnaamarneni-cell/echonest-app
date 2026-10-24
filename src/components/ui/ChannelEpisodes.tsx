'use client';

/**
 * One channel's latest uploads — shared by /podcasts/[handle] and
 * /news/[handle].
 *
 * Items come from the channel's uploads playlist (see
 * /api/podcasts/episodes), which is always complete and already ordered
 * newest-first, and are converted to ad-hoc Songs so the existing player
 * handles them with no special casing.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Mic, Newspaper, Play, Plus, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { usePlayerStore } from '@/store/player';
import { formatDuration } from '@/lib/utils';
import { PodcastEpisode, episodeToSong, timeAgo } from '@/lib/podcasts';
import { useFollowedChannels, ChannelCategory } from '@/store/followedChannels';

export function ChannelEpisodes({
  handle,
  category,
}: {
  handle: string;
  category: ChannelCategory;
}) {
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

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    fetch(`/api/podcasts/episodes?handle=${encodeURIComponent(handle)}&max=40`)
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
  }, [handle]);

  const playFrom = (index: number) => {
    const songs = episodes.map(episodeToSong);
    play(songs[index], songs, 'library');
  };

  const Icon = category === 'news' ? Newspaper : Mic;
  const label = category === 'news' ? 'News' : 'Podcast';
  const listHeading = category === 'news' ? 'Latest videos' : 'Latest episodes';

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
            {label}
          </p>
          <h1 className="truncate text-2xl font-bold sm:text-4xl">{title || handle}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {episodes.length > 0 ? (
              <button
                onClick={() => playFrom(0)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
              >
                <Play className="h-4 w-4 fill-current" />
                Play latest
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
                {followed ? `In ${label}` : `Add to ${label}`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <h2 className="text-xl font-bold">{listHeading}</h2>

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
        <div className="space-y-0.5">
          {episodes.map((ep, i) => {
            const isCurrent = currentSong?.youtube_id === ep.videoId;
            return (
              <button
                key={ep.videoId}
                onClick={() => playFrom(i)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-card-hover"
              >
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-card">
                  {ep.thumbnail ? (
                    <Image
                      src={ep.thumbnail}
                      alt={ep.title}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isCurrent ? 'text-accent' : ''}`}>
                    {ep.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {timeAgo(ep.publishedAt)}
                    {ep.duration > 0 ? ` · ${formatDuration(ep.duration)}` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Icon}
          title="Nothing published"
          description="This channel has no uploads we can read."
        />
      )}
    </div>
  );
}
