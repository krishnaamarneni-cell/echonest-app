'use client';

// Top chart for a language. There's no "trending by language" feed from
// YouTube, so we approximate a chart by merging a few "top/best/hit" search
// queries through the proxy and ranking them. Plays ad-hoc (no library writes).

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { proxySearchMany, ytVideoToSong, YtVideo } from '@/lib/ytSearch';
import { YtTrackList } from '@/components/ui/YtTrackList';
import { ViewToggle } from '@/components/ui/ViewToggle';

export default function LanguageChartPage() {
  const { lang } = useParams<{ lang: string }>();
  const language = decodeURIComponent(lang || '');
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const [items, setItems] = useState<YtVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('echonest-chart-view') : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);
  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('echonest-chart-view', v);
  };

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    setLoading(true);
    const year = new Date().getFullYear();
    proxySearchMany(
      [
        `top ${language} songs ${year}`,
        `best ${language} songs`,
        `${language} hit songs ${year}`,
        `${language} top 50`,
      ],
      AbortSignal.timeout(30000),
    )
      .then((vids) => { if (!cancelled) setItems(vids.slice(0, 50)); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language]);

  const playAt = (index: number) => {
    const songs = items.map(ytVideoToSong);
    play(songs[index], songs, 'library');
  };

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gradient-to-b from-purple-900/40 to-background p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-start gap-4">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 flex flex-col items-center justify-center shadow-2xl flex-shrink-0">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">Daily</span>
            <span className="text-2xl sm:text-4xl font-black text-white">TOP</span>
            <span className="text-3xl sm:text-5xl font-black text-white">50</span>
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider mt-1 px-1 text-center">
              {language}
            </span>
          </div>
          <div className="flex-1 pt-2 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chart</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">Top {language} Songs</h1>
            <p className="text-sm text-muted mt-3">The biggest {language} tracks right now</p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => items.length > 0 && playAt(0)}
                disabled={items.length === 0}
                className="px-4 py-2 bg-foreground text-background rounded-full text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-end">
            <ViewToggle view={view} onChange={setViewMode} />
          </div>
        )}
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-card rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load the {language} chart right now — the music proxy may be offline.
          </p>
        ) : (
          <YtTrackList items={items} view={view} onPlay={playAt} showRank />
        )}
      </div>
    </div>
  );
}
