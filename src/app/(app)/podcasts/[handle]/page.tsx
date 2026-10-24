'use client';

/**
 * One podcast — its latest episodes, newest first.
 *
 * Episodes come from the channel's uploads playlist (see
 * /api/podcasts/episodes), which is always complete and already ordered,
 * and are converted to ad-hoc Songs so the existing player handles them
 * with no special casing.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Mic, Play } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { usePlayerStore } from '@/store/player';
import { formatDuration } from '@/lib/utils';
import { PodcastEpisode, episodeToSong, timeAgo } from '@/lib/podcasts';

export default function PodcastDetailPage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const currentSong = usePlayerStore((s) => s.currentSong);

  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [title, setTitle] = useState('');
  const [thumb, setThumb] = useState('');
  const [loadedHandle, setLoadedHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived rather than stored: we're loading until the fetch for THIS
  // handle has settled, so switching podcasts shows a skeleton again
  // with no state to reset.
  const loading = loadedHandle !== handle;

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

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
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
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Podcast
          </p>
          <h1 className="truncate text-2xl font-bold sm:text-4xl">{title || handle}</h1>
          {episodes.length > 0 && (
            <button
              onClick={() => playFrom(0)}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
            >
              <Play className="h-4 w-4 fill-current" />
              Play latest
            </button>
          )}
        </div>
      </div>

      <h2 className="text-xl font-bold">Latest episodes</h2>

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
                  {ep.thumbnail && (
                    <Image
                      src={ep.thumbnail}
                      alt={ep.title}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${isCurrent ? 'text-accent' : ''}`}
                  >
                    {ep.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {timeAgo(ep.publishedAt)}
                    {ep.duration > 0 && ` · ${formatDuration(ep.duration)}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Mic}
          title="No episodes found"
          description="This channel hasn't published anything we can read."
        />
      )}
    </div>
  );
}
