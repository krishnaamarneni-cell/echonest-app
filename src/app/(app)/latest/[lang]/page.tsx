'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Music, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { proxySearchMany, ytVideoToSong, YtVideo } from '@/lib/ytSearch';
import { YtTrackList } from '@/components/ui/YtTrackList';
import { ViewToggle } from '@/components/ui/ViewToggle';

export default function LatestLanguagePage() {
  const { lang } = useParams<{ lang: string }>();
  const language = decodeURIComponent(lang || '');
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('grid');

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
        `latest ${language} songs ${year}`,
        `new ${language} songs ${year}`,
        `${language} hit songs ${year}`,
        `${language} top songs`,
        `best ${language} songs`,
      ],
      AbortSignal.timeout(30000),
    )
      .then((vids) => { if (!cancelled) setVideos(vids); })
      .catch(() => { if (!cancelled) setVideos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language]);

  const playAt = (index: number) => {
    const songs = videos.map(ytVideoToSong);
    play(songs[index], songs, 'library');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl lg:text-3xl font-bold">Latest {language} songs</h1>
      </div>

      {!loading && videos.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button onClick={() => playAt(0)}>
              <Play className="w-4 h-4 fill-current" /> Play
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const shuffled = [...videos].sort(() => Math.random() - 0.5);
                const songs = shuffled.map(ytVideoToSong);
                play(songs[0], songs, 'library');
              }}
            >
              <Shuffle className="w-4 h-4" /> Shuffle
            </Button>
          </div>
          <ViewToggle view={view} onChange={setViewMode} />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square rounded-xl bg-card animate-pulse" />
              <div className="h-3 bg-card rounded mt-3 w-3/4 animate-pulse" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <Music className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load {language} songs right now. The music proxy may be offline — try again later.
          </p>
        </div>
      ) : (
        <YtTrackList items={videos} view={view} onPlay={playAt} />
      )}
    </div>
  );
}
