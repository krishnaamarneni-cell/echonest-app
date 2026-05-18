'use client';

/**
 * Charts page: regional Top 50 from YouTube's chart=mostPopular feed.
 * Same data we use in Explore's Trending block, but here it's the whole
 * page and the region is parameterized in the URL — so charts/IN,
 * charts/US, charts/GB etc. each surface a different audience's top
 * tracks with live view/like counts.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, Eye, ThumbsUp, ArrowLeft, Play, Loader2 } from 'lucide-react';

interface TrendingItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  viewCount: number;
  likeCount: number;
}

const REGION_LABELS: Record<string, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  KR: 'South Korea',
  BR: 'Brazil',
  MX: 'Mexico',
  global: 'Global',
};

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ChartsRegionPage() {
  const { region } = useParams<{ region: string }>();
  const router = useRouter();
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const play = usePlayerStore((s) => s.play);

  const regionLabel = REGION_LABELS[region?.toUpperCase()] || region;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/youtube-trending?region=${encodeURIComponent(region || 'IN')}&max=50`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && Array.isArray(body?.items)) {
          setItems(body.items);
          setError(null);
        } else {
          setError(body?.error || `Couldn't load (${r.status})`);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [region]);

  const playItem = async (v: TrendingItem) => {
    setAddingId(v.videoId);
    try {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from('songs')
        .select('*')
        .eq('youtube_id', v.videoId)
        .eq('source', 'youtube_embed')
        .limit(1)
        .maybeSingle();
      if (existing) {
        play(existing as Song, [existing as Song], 'library');
        return;
      }
      const res = await fetch('/api/youtube-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          contentType: 'music',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.song) {
        play(data.song as Song, [data.song as Song], 'library');
      }
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gradient-to-b from-red-900/40 to-background p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-start gap-4">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl bg-gradient-to-br from-red-500 via-pink-500 to-rose-600 flex flex-col items-center justify-center shadow-2xl flex-shrink-0">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">
              Daily
            </span>
            <span className="text-2xl sm:text-4xl font-black text-white">TOP</span>
            <span className="text-3xl sm:text-5xl font-black text-white">50</span>
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider mt-1">
              {regionLabel}
            </span>
          </div>
          <div className="flex-1 pt-2 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chart</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">
              Top Music · {regionLabel}
            </h1>
            <p className="text-sm text-muted mt-3">
              Updated daily · live view counts from YouTube
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => items.length > 0 && playItem(items[0])}
                disabled={items.length === 0}
                className="px-4 py-2 bg-foreground text-background rounded-full text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-card rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load — {error}</p>
        ) : (
          <div className="space-y-0.5">
            {items.map((v, idx) => (
              <button
                key={v.videoId}
                onClick={() => playItem(v)}
                disabled={addingId === v.videoId}
                className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-card-hover text-left transition-colors disabled:opacity-60 w-full"
              >
                <span className="text-sm text-muted-foreground tabular-nums w-8 text-right flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="relative w-10 h-10 rounded-md overflow-hidden bg-card flex-shrink-0">
                  <Image
                    src={v.thumbnail}
                    alt={v.title}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    {addingId === v.videoId ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 text-white fill-current" />
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.channel}</p>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {compactNumber(v.viewCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3" />
                    {compactNumber(v.likeCount)}
                  </span>
                  {v.duration > 0 && (
                    <span className="tabular-nums">{formatDuration(v.duration)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
