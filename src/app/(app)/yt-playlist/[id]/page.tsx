'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { Button } from '@/components/ui/Button';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { usePlayerStore } from '@/store/player';
import { Play, Shuffle, ListMusic, ArrowLeft, ExternalLink, Music, MoreHorizontal, Trash2, Heart, ListPlus } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { useLikesStore } from '@/store/likes';
import { usePlaylistDialog } from '@/store/playlistDialog';
import Image from 'next/image';

interface PlaylistVideo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
}

export default function YouTubePlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<Song | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<InstanceType<typeof window.YT.Player> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const play = usePlayerStore((s) => s.play);
  const { ytLikedVideoIds, loadLikes, toggleYouTubeLike } = useLikesStore();
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);

  useEffect(() => { loadLikes(); }, [loadLikes]);

  // Load the playlist song record
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('songs')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setSong(data as Song);
      });
  }, [id]);

  // Load YouTube IFrame API & extract playlist videos
  const loadPlaylistVideos = useCallback(() => {
    if (!song?.youtube_id || !containerRef.current) return;

    const wrapper = containerRef.current;
    wrapper.innerHTML = '';
    const target = document.createElement('div');
    wrapper.appendChild(target);

    playerRef.current = new window.YT.Player(target, {
      height: '0',
      width: '0',
      playerVars: {
        listType: 'playlist',
        list: song.youtube_id,
        autoplay: 0,
      },
      events: {
        onReady: async () => {
          try {
            const ids: string[] = (playerRef.current as unknown as { getPlaylist: () => string[] })?.getPlaylist() || [];
            if (!ids.length) {
              setError('Could not load playlist contents. The playlist may be private or empty.');
              setLoading(false);
              return;
            }

            // Fetch metadata for each video via oEmbed
            const results = await Promise.all(
              ids.map(async (videoId) => {
                try {
                  const res = await fetch(
                    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
                  );
                  if (res.ok) {
                    const meta = await res.json();
                    return {
                      videoId,
                      title: meta.title || 'Untitled',
                      author: meta.author_name || 'YouTube',
                      thumbnail: meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/default.jpg`,
                    };
                  }
                } catch {}
                return {
                  videoId,
                  title: `Video ${videoId}`,
                  author: 'YouTube',
                  thumbnail: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
                };
              })
            );

            setVideos(results);
            setLoading(false);
          } catch {
            setError('Failed to load playlist videos');
            setLoading(false);
          }
        },
        onError: (e: { data?: number }) => {
          const codes: Record<number, string> = {
            2: 'Invalid YouTube URL',
            5: 'YouTube player error',
            100: 'Video not found or removed',
            101: "Videos in this playlist can't be embedded — the uploaders (labels) have blocked it. Open on YouTube to listen.",
            150: "Videos in this playlist can't be embedded — the uploaders (labels) have blocked it. Open on YouTube to listen.",
          };
          setError(
            codes[e.data || 0] ||
              'Could not load playlist. It may be private or the videos may have embedding disabled.',
          );
          setLoading(false);
        },
      },
    });
  }, [song]);

  useEffect(() => {
    if (!song) return;

    if (window.YT && window.YT.Player) {
      loadPlaylistVideos();
    } else {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
      window.onYouTubeIframeAPIReady = () => loadPlaylistVideos();
    }

    return () => {
      try {
        playerRef.current?.destroy();
      } catch {}
    };
  }, [song, loadPlaylistVideos]);

  const playVideo = (video: PlaylistVideo) => {
    const tempSong: Song = {
      id: `yt-${video.videoId}`,
      user_id: song?.user_id || '',
      title: video.title,
      artist_name: video.author,
      album_name: null,
      album_id: null,
      artist_id: null,
      duration: 0,
      file_url: '',
      cover_url: video.thumbnail,
      genre: null,
      track_number: null,
      source: 'youtube_embed',
      youtube_id: video.videoId,
      youtube_kind: 'video',
      created_at: new Date().toISOString(),
    };

    const queue: Song[] = videos.map((v) => ({
      id: `yt-${v.videoId}`,
      user_id: song?.user_id || '',
      title: v.title,
      artist_name: v.author,
      album_name: null,
      album_id: null,
      artist_id: null,
      duration: 0,
      file_url: '',
      cover_url: v.thumbnail,
      genre: null,
      track_number: null,
      source: 'youtube_embed',
      youtube_id: v.videoId,
      youtube_kind: 'video',
      created_at: new Date().toISOString(),
    }));

    play(tempSong, queue, 'playlist');
  };

  const playAll = () => {
    if (videos.length > 0) playVideo(videos[0]);
  };

  const shuffleAll = () => {
    if (videos.length === 0) return;
    const shuffled = [...videos].sort(() => Math.random() - 0.5);
    setVideos(shuffled);
    setTimeout(() => playVideo(shuffled[0]), 0);
  };

  return (
    <div className="animate-fade-in">
      <div ref={containerRef} className="hidden" aria-hidden />

      <div className="relative bg-gradient-to-b from-red-900/30 to-background p-4 sm:p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          className="lg:hidden mb-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-xl bg-card overflow-hidden flex-shrink-0 shadow-2xl mx-auto sm:mx-0">
            {song?.cover_url ? (
              <Image
                src={song.cover_url}
                alt={song.title}
                width={192}
                height={192}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-600/30 to-purple-600/30">
                <ListMusic className="w-16 h-16 text-red-500" />
              </div>
            )}
          </div>
          <div className="flex-1 pt-2 text-center sm:text-left">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              YouTube Playlist
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold mt-1 break-words">
              {song?.title || 'Loading...'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{song?.artist_name}</p>
            <p className="text-sm text-muted mt-2">
              {loading ? 'Loading videos...' : `${videos.length} videos`}
            </p>

            <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 mt-4 flex-wrap">
              <Button onClick={playAll} disabled={videos.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="secondary" onClick={shuffleAll} disabled={videos.length === 0}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              {song?.youtube_id && (
                <a
                  href={`https://www.youtube.com/playlist?list=${song.youtube_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> YouTube
                </a>
              )}
              <Menu
                trigger={
                  <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                }
                items={[
                  {
                    label: 'Remove from library',
                    icon: Trash2,
                    variant: 'danger',
                    onClick: async () => {
                      if (!confirm(`Remove "${song?.title}" from your library?`)) return;
                      const supabase = createClient();
                      const { error } = await supabase.from('songs').delete().eq('id', id);
                      if (error) { alert('Failed: ' + error.message); return; }
                      router.push('/import');
                      router.refresh();
                    },
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8 pt-4">
        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        {loading && !error ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        ) : videos.length > 0 ? (
          <div className="space-y-0.5">
            {videos.map((video, i) => {
              const isLiked = ytLikedVideoIds.has(video.videoId);
              return (
                <div
                  key={`${video.videoId}-${i}`}
                  onClick={() => playVideo(video)}
                  className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-card-hover transition-colors text-left cursor-pointer"
                >
                  <span className="w-6 text-sm text-muted text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="w-12 h-12 rounded-md bg-card overflow-hidden flex-shrink-0 relative">
                    {video.thumbnail ? (
                      <Image
                        src={video.thumbnail}
                        alt={video.title}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{video.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {video.author}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleYouTubeLike(video.videoId, video.title, video.author, video.thumbnail);
                    }}
                    className={`p-1 transition-colors ${
                      isLiked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={isLiked ? 'Unlike' : 'Like'}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                  </button>
                  <Menu
                    trigger={
                      <button
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    }
                    items={[
                      {
                        label: 'Add to playlist',
                        icon: ListPlus,
                        onClick: () =>
                          openPlaylistDialog({
                            youtubeVideo: {
                              videoId: video.videoId,
                              title: video.title,
                              author: video.author,
                              thumbnail: video.thumbnail,
                            },
                            displayTitle: video.title,
                          }),
                      },
                    ]}
                  />
                  <Play className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
