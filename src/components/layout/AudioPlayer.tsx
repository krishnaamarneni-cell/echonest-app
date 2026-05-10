'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { usePlayerStore } from '@/store/player';
import { formatDuration } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
  X,
  ChevronUp,
  Heart,
  MoreHorizontal,
  ListPlus,
} from 'lucide-react';
import Image from 'next/image';
import { Song } from '@/types';
import { useLikesStore } from '@/store/likes';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { Menu } from '@/components/ui/Menu';
import { YouTubeView } from './YouTubeView';

function PlayerMoreButton({ song }: { song: Song }) {
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);

  // Playlists can't be added to a playlist
  if (song.source === 'youtube_embed' && song.youtube_kind === 'playlist') return null;

  return (
    <Menu
      trigger={
        <button
          className="p-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="More options"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      }
      items={[
        {
          label: 'Add to playlist',
          icon: ListPlus,
          onClick: () => {
            const isAdHocYT = song.id.startsWith('yt-');
            if (isAdHocYT && song.youtube_id) {
              openPlaylistDialog({
                youtubeVideo: {
                  videoId: song.youtube_id,
                  title: song.title,
                  author: song.artist_name,
                  thumbnail:
                    song.cover_url ||
                    `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`,
                },
                displayTitle: song.title,
              });
            } else {
              openPlaylistDialog({
                songId: song.id,
                displayTitle: song.title,
              });
            }
          },
        },
      ]}
    />
  );
}

function PlayerLikeButton({ song }: { song: Song }) {
  const { likedIds, ytLikedVideoIds, toggleLike, toggleYouTubeLike, loadLikes } = useLikesStore();

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const isYTVideo = song.source === 'youtube_embed' && song.youtube_kind === 'video';
  const isYTPlaylist = song.source === 'youtube_embed' && song.youtube_kind === 'playlist';
  const isAdHocYT = song.id.startsWith('yt-');

  if (isYTPlaylist) return null;

  let isLiked = false;
  let onClick: () => void;

  if (isAdHocYT && song.youtube_id) {
    isLiked = ytLikedVideoIds.has(song.youtube_id);
    onClick = () =>
      toggleYouTubeLike(
        song.youtube_id!,
        song.title,
        song.artist_name,
        song.cover_url || `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`,
      );
  } else if (isYTVideo && song.youtube_id) {
    isLiked = likedIds.has(song.id) || ytLikedVideoIds.has(song.youtube_id);
    onClick = () => toggleLike(song.id);
  } else {
    isLiked = likedIds.has(song.id);
    onClick = () => toggleLike(song.id);
  }

  return (
    <button
      onClick={onClick}
      className={`p-2 transition-colors flex-shrink-0 ${
        isLiked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-label={isLiked ? 'Unlike' : 'Like'}
    >
      <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
    </button>
  );
}

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement | string,
        config: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: Record<string, (e: { data?: number; target?: unknown }) => void>;
        }
      ) => {
        playVideo: () => void;
        pauseVideo: () => void;
        seekTo: (s: number, allow: boolean) => void;
        getCurrentTime: () => number;
        getDuration: () => number;
        getPlayerState: () => number;
        setVolume: (v: number) => void;
        loadVideoById: (id: string) => void;
        loadPlaylist: (args: { list: string; listType: string }) => void;
        nextVideo: () => void;
        previousVideo: () => void;
        destroy: () => void;
      };
      PlayerState: { PLAYING: number; ENDED: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<InstanceType<typeof window.YT.Player> | null>(null);
  const ytIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [ytReady, setYtReady] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytView, setYtView] = useState<'hidden' | 'mini' | 'full'>('hidden');

  const {
    currentSong,
    isPlaying,
    volume,
    isMuted,
    progress,
    duration,
    shuffle,
    repeat,
    isPlayerVisible,
    pause,
    resume,
    next,
    previous,
    setVolume,
    toggleMute,
    setProgress,
    setDuration,
    toggleShuffle,
    cycleRepeat,
    setIsPlaying,
    queue,
    queueIndex,
    play,
  } = usePlayerStore();

  const isYouTube = currentSong?.source === 'youtube_embed';
  const isYouTubePlaylist = isYouTube && currentSong?.youtube_kind === 'playlist';

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) {
      setYtReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // Manage YouTube player
  useEffect(() => {
    if (!ytReady || !isYouTube || !currentSong?.youtube_id || !ytContainerRef.current) return;

    if (ytPlayerRef.current) {
      if (isYouTubePlaylist) {
        ytPlayerRef.current.loadPlaylist({ list: currentSong.youtube_id, listType: 'playlist' });
      } else {
        ytPlayerRef.current.loadVideoById(currentSong.youtube_id);
      }
      return;
    }

    setYtError(null);
    setYtView('hidden');

    // Create a YT-owned child element so React doesn't try to manage what YT replaces
    const wrapper = ytContainerRef.current;
    wrapper.innerHTML = '';
    const ytTarget = document.createElement('div');
    wrapper.appendChild(ytTarget);

    ytPlayerRef.current = new window.YT.Player(ytTarget, {
      height: '180',
      width: '320',
      videoId: isYouTubePlaylist ? undefined : currentSong.youtube_id,
      playerVars: {
        autoplay: 1,
        controls: 0,
        playsinline: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        ...(isYouTubePlaylist
          ? { listType: 'playlist', list: currentSong.youtube_id }
          : {}),
      },
      events: {
        onReady: (e: { target?: unknown }) => {
          (e.target as { setVolume: (v: number) => void; playVideo: () => void }).setVolume((isMuted ? 0 : volume) * 100);
          (e.target as { playVideo: () => void }).playVideo();
        },
        onStateChange: (e: { data?: number }) => {
          // Sync YT player state with our store
          if (e.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
          } else if (e.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
          } else if (e.data === window.YT.PlayerState.ENDED) {
            if (repeat === 'one') {
              ytPlayerRef.current?.seekTo(0, true);
              ytPlayerRef.current?.playVideo();
            } else if (!isYouTubePlaylist) {
              next();
            }
          }
        },
        onError: (e: { data?: number }) => {
          const codes: Record<number, string> = {
            2: 'Invalid YouTube URL',
            5: 'YouTube player error',
            100: 'Video not found or removed',
            101: 'Embedding disabled by owner',
            150: 'Embedding disabled by owner',
          };
          setYtError(
            (e.data && codes[e.data]) ||
              'Could not play. Playlist may be private — set it to Public or Unlisted.'
          );
        },
      },
    });

    return () => {
      if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
    };
  }, [ytReady, isYouTube, currentSong?.youtube_id]);

  // YouTube progress polling
  useEffect(() => {
    if (!isYouTube || !ytPlayerRef.current) return;
    if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);

    ytIntervalRef.current = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        setProgress(p.getCurrentTime() || 0);
        const d = p.getDuration() || 0;
        if (d > 0) setDuration(d);
      } catch {}
    }, 500);

    return () => {
      if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
    };
  }, [isYouTube, currentSong?.youtube_id, setProgress, setDuration]);

  // YouTube play/pause — only call YT if state actually differs to avoid feedback loops
  useEffect(() => {
    if (!isYouTube || !ytPlayerRef.current) return;
    try {
      const ytState = ytPlayerRef.current.getPlayerState();
      const ytPlaying = ytState === window.YT.PlayerState.PLAYING;
      if (isPlaying && !ytPlaying) {
        ytPlayerRef.current.playVideo();
      } else if (!isPlaying && ytPlaying) {
        ytPlayerRef.current.pauseVideo();
      }
    } catch {}
  }, [isPlaying, isYouTube]);

  // YouTube volume
  useEffect(() => {
    if (!isYouTube || !ytPlayerRef.current) return;
    try {
      ytPlayerRef.current.setVolume((isMuted ? 0 : volume) * 100);
    } catch {}
  }, [volume, isMuted, isYouTube]);

  // Media Session API — lock screen / notification controls
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentSong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist_name,
      album: currentSong.album_name || 'EchoNest',
      artwork: currentSong.cover_url
        ? [
            { src: currentSong.cover_url, sizes: '96x96', type: 'image/jpeg' },
            { src: currentSong.cover_url, sizes: '192x192', type: 'image/jpeg' },
            { src: currentSong.cover_url, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });

    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime === undefined) return;
      if (isYouTube && ytPlayerRef.current) {
        try { ytPlayerRef.current.seekTo(details.seekTime, true); } catch {}
      } else if (audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
      }
      setProgress(details.seekTime);
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {}
    };
  }, [currentSong, resume, pause, previous, next, isYouTube, setProgress]);

  // Update playback state for Media Session
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Update position state for seek bar in Media Session UI
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession.setPositionState ||
      !duration ||
      !isFinite(duration)
    )
      return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(progress, duration),
        playbackRate: 1,
      });
    } catch {}
  }, [progress, duration]);

  // Native audio src change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong || isYouTube) return;
    audio.src = currentSong.file_url;
    if (isPlaying) audio.play().catch(() => {});
  }, [currentSong, isYouTube]);

  // Native audio play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isYouTube) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, isYouTube]);

  // Native audio volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isYouTube) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted, isYouTube]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);
  }, [setProgress]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }, [setDuration]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } else {
      next();
    }
  }, [repeat, next]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (isYouTube && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(time, true);
      } catch {}
    } else {
      const audio = audioRef.current;
      if (audio) audio.currentTime = time;
    }
    setProgress(time);
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const showPlayer = isPlayerVisible && currentSong;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      {/* YT iframe — always rendered to keep iframe alive */}
      <YouTubeView
        view={isYouTube ? ytView : 'hidden'}
        containerRef={ytContainerRef}
        currentSong={currentSong}
        queue={queue}
        queueIndex={queueIndex}
        onClose={() => setYtView('hidden')}
        onMini={() => setYtView('mini')}
        onFull={() => setYtView('full')}
        onPlayQueueItem={(item) => {
          play(item.song, queue.map((q) => q.song), item.source as 'playlist' | 'album' | 'library');
        }}
      />

      {/* Show/hide video toggle button — only visible when YT is playing successfully and view is hidden */}
      {isYouTube && !ytError && ytView === 'hidden' && (
        <button
          onClick={() => setYtView('mini')}
          className="fixed right-3 z-40 w-9 h-9 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ bottom: 'calc(var(--player-height) + 8px)' }}
          aria-label="Show video"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {/* Error popup — now dismissable */}
      {isYouTube && ytError && (
        <div
          className="fixed right-3 left-3 sm:left-auto sm:right-4 z-50 sm:max-w-[320px] bg-card border border-destructive rounded-xl p-3 shadow-2xl"
          style={{ bottom: 'calc(var(--player-height) + 8px)' }}
        >
          <button
            onClick={() => setYtError(null)}
            className="absolute top-2 right-2 w-6 h-6 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-xs font-medium text-destructive mb-1 pr-6">{ytError}</p>
          <div className="flex items-center gap-3 mt-1">
            {currentSong?.youtube_id && (
              <a
                href={
                  isYouTubePlaylist
                    ? `https://www.youtube.com/playlist?list=${currentSong.youtube_id}`
                    : `https://www.youtube.com/watch?v=${currentSong.youtube_id}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Open on YouTube ↗
              </a>
            )}
            <button
              onClick={() => {
                setYtError(null);
                next();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip track
            </button>
          </div>
        </div>
      )}

      {showPlayer && currentSong && (<div className="fixed bottom-0 lg:bottom-0 left-0 right-0 z-50 h-[var(--player-height)] glass border-t border-border animate-slide-up">
        <div
          className="absolute top-0 left-0 h-0.5 bg-accent transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />

        <div className="h-full flex items-center justify-between px-4 lg:px-6 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3 flex-1 min-w-0 lg:w-1/4">
            <div className="w-12 h-12 rounded-lg bg-card overflow-hidden flex-shrink-0 relative">
              {currentSong.cover_url ? (
                <Image
                  src={currentSong.cover_url}
                  alt={currentSong.title}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-5 h-5 text-muted" />
                </div>
              )}
              {isYouTube && (
                <div className="absolute bottom-0 right-0 bg-red-600 text-white text-[8px] px-1 rounded-tl">YT</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{currentSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentSong.artist_name}
              </p>
            </div>
            <PlayerLikeButton song={currentSong} />
            <PlayerMoreButton song={currentSong} />
          </div>

          <div className="flex flex-col items-center gap-1 lg:flex-1 lg:max-w-lg">
            <div className="flex items-center gap-3 lg:gap-4">
              <button
                onClick={toggleShuffle}
                className={`hidden lg:block transition-colors ${
                  shuffle ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (isYouTubePlaylist && ytPlayerRef.current) {
                    try { ytPlayerRef.current.previousVideo(); } catch { previous(); }
                  } else {
                    previous();
                  }
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={isPlaying ? pause : resume}
                className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={() => {
                  if (isYouTubePlaylist && ytPlayerRef.current) {
                    try { ytPlayerRef.current.nextVideo(); } catch { next(); }
                  } else {
                    next();
                  }
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`hidden lg:block transition-colors ${
                  repeat !== 'off' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-2 w-full">
              <span className="text-[11px] text-muted tabular-nums w-10 text-right">
                {formatDuration(progress)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={progress}
                onChange={handleSeek}
                className="flex-1 h-1"
                style={{
                  background: `linear-gradient(to right, var(--accent) ${progressPercent}%, #27272a ${progressPercent}%)`,
                }}
              />
              <span className="text-[11px] text-muted tabular-nums w-10">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 justify-end w-1/4">
            <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24 h-1"
              style={{
                background: `linear-gradient(to right, var(--foreground) ${
                  (isMuted ? 0 : volume) * 100
                }%, #27272a ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>)}
    </>
  );
}

