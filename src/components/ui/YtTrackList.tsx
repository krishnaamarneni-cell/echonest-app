'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { Play, Heart, Music, Eye } from 'lucide-react';
import { useLikesStore } from '@/store/likes';

export interface YtTrack {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  viewCount?: number;
}

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

// Shared list/grid renderer for YouTube tracks (charts, latest, etc.) with a
// heart that toggles the track in EchoNest's Liked Songs.
export function YtTrackList({
  items,
  view,
  onPlay,
  showRank = false,
}: {
  items: YtTrack[];
  view: 'list' | 'grid';
  onPlay: (index: number) => void;
  showRank?: boolean;
}) {
  const ytLikedVideoIds = useLikesStore((s) => s.ytLikedVideoIds);
  const toggleYouTubeLike = useLikesStore((s) => s.toggleYouTubeLike);
  const loadLikes = useLikesStore((s) => s.loadLikes);
  useEffect(() => { loadLikes(); }, [loadLikes]);

  const HeartBtn = ({ v, className = '' }: { v: YtTrack; className?: string }) => {
    const liked = ytLikedVideoIds.has(v.videoId);
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleYouTubeLike(v.videoId, v.title, v.channel, v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`);
        }}
        className={`flex items-center justify-center transition-colors ${liked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'} ${className}`}
        aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        title={liked ? 'Liked' : 'Add to Liked Songs'}
      >
        <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
      </button>
    );
  };

  if (view === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {items.map((v, i) => (
          <div key={v.videoId} className="group">
            <div className="relative aspect-square rounded-xl overflow-hidden bg-card">
              <button onClick={() => onPlay(i)} className="block w-full h-full" aria-label={`Play ${v.title}`}>
                {v.thumbnail ? (
                  <Image
                    src={v.thumbnail}
                    alt={v.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-10 h-10 text-muted" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </button>
              <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <HeartBtn v={v} />
              </div>
            </div>
            <p className="font-medium text-sm truncate mt-2">{v.title}</p>
            <p className="text-xs text-muted-foreground truncate">{v.channel}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((v, i) => (
        <div key={v.videoId} className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-card-hover transition-colors">
          {showRank && (
            <span className="text-sm text-muted-foreground tabular-nums w-8 text-right flex-shrink-0">{i + 1}</span>
          )}
          <button onClick={() => onPlay(i)} className="group/btn flex items-center gap-3 flex-1 min-w-0 text-left">
            <div className="relative w-10 h-10 rounded-md overflow-hidden bg-card flex-shrink-0">
              <Image
                src={v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                alt={v.title}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-4 h-4 text-white fill-current" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{v.title}</p>
              <p className="text-xs text-muted-foreground truncate">{v.channel}</p>
            </div>
          </button>
          {typeof v.viewCount === 'number' && v.viewCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted">
              <Eye className="w-3 h-3" />
              {compactNumber(v.viewCount)}
            </span>
          )}
          <HeartBtn v={v} className="p-1" />
        </div>
      ))}
    </div>
  );
}
