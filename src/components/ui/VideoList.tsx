'use client';

/**
 * List/grid renderer for channel videos — used by the News and Podcasts
 * feeds and by a single channel's page, so every surface showing videos
 * looks and behaves the same and gets the view toggle for free.
 */

import Image from 'next/image';
import { Play } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { timeAgo } from '@/lib/podcasts';

export interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
  duration: number;
  viewCount?: number;
}

function compactViews(n?: number): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
  return `${n} views`;
}

function meta(v: VideoItem, showViews: boolean): string {
  return [
    showViews ? compactViews(v.viewCount) : '',
    timeAgo(v.publishedAt),
    v.duration > 0 ? formatDuration(v.duration) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function VideoList({
  items,
  view,
  onPlay,
  currentVideoId,
  showChannel = true,
  showViews = false,
}: {
  items: VideoItem[];
  view: 'list' | 'grid';
  onPlay: (index: number) => void;
  currentVideoId?: string | null;
  showChannel?: boolean;
  showViews?: boolean;
}) {
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
        {items.map((v, i) => (
          <button key={v.videoId} onClick={() => onPlay(i)} className="group text-left">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-card shadow-lg">
              {v.thumbnail ? (
                <Image
                  src={v.thumbnail}
                  alt={v.title}
                  fill
                  sizes="(max-width: 640px) 50vw, 20vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="h-8 w-8 fill-white text-white" />
              </div>
            </div>
            <p
              className={`mt-2 line-clamp-2 text-sm font-medium ${
                currentVideoId === v.videoId ? 'text-accent' : ''
              }`}
            >
              {v.title}
            </p>
            {showChannel && v.channel ? (
              <p className="truncate text-xs text-muted-foreground">{v.channel}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">{meta(v, showViews)}</p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((v, i) => (
        <button
          key={v.videoId}
          onClick={() => onPlay(i)}
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-card-hover"
        >
          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-card sm:h-14 sm:w-24">
            {v.thumbnail ? (
              <Image src={v.thumbnail} alt={v.title} fill sizes="96px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-medium ${
                currentVideoId === v.videoId ? 'text-accent' : ''
              }`}
            >
              {v.title}
            </p>
            {showChannel && v.channel ? (
              <p className="truncate text-xs text-muted-foreground">{v.channel}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">{meta(v, showViews)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
