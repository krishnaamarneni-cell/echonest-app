'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Play, Loader2, Music } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { Song } from '@/types';

interface YtVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

// A Home row of the latest songs for one language, pulled live from the
// proxy's yt-dlp search. Tapping a card plays it ad-hoc (a `yt-<id>` Song
// that streams through the proxy) WITHOUT writing to the shared library.
export function LanguageMusicRow({ language }: { language: string }) {
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
    const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
    if (!proxyUrl || !proxySecret) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    const q = `latest ${language} songs ${new Date().getFullYear()}`;
    fetch(`${proxyUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(q)}&s=${encodeURIComponent(proxySecret)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { videos?: YtVideo[] } | null) => {
        if (cancelled) return;
        setVideos((d?.videos || []).filter((v) => v.videoId).slice(0, 12));
      })
      .catch(() => { if (!cancelled) setVideos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language]);

  const playVideo = (v: YtVideo, list: YtVideo[]) => {
    const toSong = (x: YtVideo): Song => ({
      id: `yt-${x.videoId}`,
      user_id: '',
      title: x.title,
      artist_name: x.channel || 'YouTube',
      album_name: null,
      album_id: null,
      artist_id: null,
      duration: 0,
      file_url: '',
      cover_url: x.thumbnail || `https://i.ytimg.com/vi/${x.videoId}/hqdefault.jpg`,
      genre: null,
      track_number: null,
      source: 'youtube_embed',
      youtube_id: x.videoId,
      youtube_kind: 'video',
      content_type: 'music',
      created_at: new Date().toISOString(),
    });
    play(toSong(v), list.map(toSong), 'library');
  };

  // Hide the row entirely if there's nothing to show (e.g. proxy down).
  if (!loading && videos.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">Latest {language} songs</h2>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-36 sm:w-44 flex-shrink-0">
                <div className="aspect-square rounded-xl bg-card animate-pulse" />
                <div className="h-3 bg-card rounded mt-3 w-3/4 animate-pulse" />
              </div>
            ))
          : videos.map((v) => (
              <button
                key={v.videoId}
                onClick={() => playVideo(v, videos)}
                className="group w-36 sm:w-44 flex-shrink-0 text-left"
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-card">
                  {v.thumbnail ? (
                    <Image
                      src={v.thumbnail}
                      alt={v.title}
                      fill
                      sizes="176px"
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
    </section>
  );
}
