'use client';

// Top chart for a language. There's no "trending by language" feed from
// YouTube, so we approximate a chart by merging a few "top/best/hit" search
// queries through the proxy and ranking them. Plays ad-hoc (no library writes).

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Play } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { proxySearchMany, ytVideoToSong, YtVideo } from '@/lib/ytSearch';

export default function LanguageChartPage() {
  const { lang } = useParams<{ lang: string }>();
  const language = decodeURIComponent(lang || '');
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const [items, setItems] = useState<YtVideo[]>([]);
  const [loading, setLoading] = useState(true);

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

      <div className="p-4 sm:p-6 lg:p-8">
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
          <div className="space-y-0.5">
            {items.map((v, idx) => (
              <button
                key={v.videoId}
                onClick={() => playAt(idx)}
                className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-card-hover text-left transition-colors w-full"
              >
                <span className="text-sm text-muted-foreground tabular-nums w-8 text-right flex-shrink-0">
                  {idx + 1}
                </span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
