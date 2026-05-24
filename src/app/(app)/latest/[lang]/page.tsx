'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Play, Music, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { proxySearchMany, ytVideoToSong, YtVideo } from '@/lib/ytSearch';

export default function LatestLanguagePage() {
  const { lang } = useParams<{ lang: string }>();
  const language = decodeURIComponent(lang || '');
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [loading, setLoading] = useState(true);

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

  const playAt = (index: number, list: YtVideo[]) => {
    const songs = list.map(ytVideoToSong);
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
        <div className="flex gap-2">
          <Button onClick={() => playAt(0, videos)}>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {videos.map((v, i) => (
            <button key={v.videoId} onClick={() => playAt(i, videos)} className="group text-left">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-card">
                {v.thumbnail ? (
                  <Image
                    src={v.thumbnail}
                    alt={v.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
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
              </div>
              <p className="font-medium text-sm truncate mt-2">{v.title}</p>
              <p className="text-xs text-muted-foreground truncate">{v.channel}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
