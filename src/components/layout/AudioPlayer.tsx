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
import { useBackgroundMode } from '@/store/backgroundMode';
import { useOfflineStore } from '@/store/offline';
import { useAutoplay } from '@/store/autoplay';
import { Menu } from '@/components/ui/Menu';
import { YouTubeView } from './YouTubeView';
import { fetchRecommendations, videosToQueueItems } from '@/lib/autoplayQueue';

function SpeedButton({
  playbackRate,
  setPlaybackRate,
}: {
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
}) {
  return (
    <Menu
      align="right"
      trigger={
        <button
          className={`px-2 py-1 rounded-md text-xs font-bold tabular-nums transition-colors ${
            playbackRate !== 1
              ? 'bg-accent text-white'
              : 'text-muted-foreground hover:text-foreground border border-border'
          }`}
          aria-label="Playback speed"
          title="Playback speed"
        >
          {playbackRate === 1 ? '1×' : `${playbackRate}×`}
        </button>
      }
      items={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => ({
        label: `${rate}× ${rate === playbackRate ? '✓' : ''}`,
        onClick: () => setPlaybackRate(rate),
      }))}
    />
  );
}

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
        mute: () => void;
        unMute: () => void;
        loadVideoById: (id: string) => void;
        loadPlaylist: (args: { list: string; listType: string }) => void;
        nextVideo: () => void;
        previousVideo: () => void;
        setSize: (w: number, h: number) => void;
        setPlaybackRate: (rate: number) => void;
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
  // Once we observe a duration we trust, lock it. Streaming audio can
  // re-estimate duration mid-playback (especially after backgrounding),
  // sometimes doubling it — we ignore those updates per song.
  const stableDurationRef = useRef<{ songId: string | null; value: number; locked: boolean }>({
    songId: null,
    value: 0,
    locked: false,
  });
  const bgMode = useBackgroundMode((s) => s.enabled);
  const hydrateBg = useBackgroundMode((s) => s.hydrate);
  useEffect(() => { hydrateBg(); }, [hydrateBg]);

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
    openNowPlaying,
    playbackRate,
    setPlaybackRate,
    pendingSeek,
    clearPendingSeek,
  } = usePlayerStore();

  // External seek (e.g. listen-along sync) — apply to the audio element
  // and to the YT player if active. Only clear if the audio has actually
  // loaded enough metadata that setting currentTime will take effect;
  // otherwise leave pendingSeek for handleLoadedMetadata to apply.
  useEffect(() => {
    if (pendingSeek == null) return;
    const audio = audioRef.current;
    let applied = false;
    if (
      audio &&
      !isNaN(pendingSeek) &&
      isFinite(pendingSeek) &&
      audio.readyState >= 1 && // HAVE_METADATA
      audio.duration > pendingSeek
    ) {
      try { audio.currentTime = pendingSeek; applied = true; } catch {}
    }
    if (ytPlayerRef.current?.seekTo) {
      try { ytPlayerRef.current.seekTo(pendingSeek, true); applied = true; } catch {}
    }
    if (applied) clearPendingSeek();
  }, [pendingSeek, clearPendingSeek]);

  const isYouTube = currentSong?.source === 'youtube_embed';
  const isYouTubePlaylist = isYouTube && currentSong?.youtube_kind === 'playlist';

  // Device-side download (IndexedDB). If the current song is cached on
  // this device, we play from a local blob URL — no proxy, no network,
  // perfect iOS background play. This takes priority over hybrid mode.
  const isOfflineAvailable = useOfflineStore((s) =>
    currentSong ? s.ids.has(currentSong.id) : false,
  );
  const [offlineAudioUrl, setOfflineAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    // Resolve the blob → object URL whenever the current song flips to
    // an offline-available one. Revoke the previous URL to avoid leaking
    // memory across track changes.
    let cancelled = false;
    let urlToRevoke: string | null = null;
    if (currentSong && isOfflineAvailable) {
      useOfflineStore
        .getState()
        .getBlobUrl(currentSong.id)
        .then((url) => {
          if (cancelled) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          urlToRevoke = url;
          setOfflineAudioUrl(url);
        });
    } else {
      setOfflineAudioUrl(null);
    }
    return () => {
      cancelled = true;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [currentSong?.id, isOfflineAvailable]);

  // Background-play mode via the personal yt-proxy at
  // NEXT_PUBLIC_YT_PROXY_URL. Could be Fly, a laptop+Cloudflare-Tunnel,
  // an Oracle VM, etc. — whatever is currently running yt-dlp on a
  // non-flagged IP.
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  const proxyConfigured = !!(proxyUrl && proxySecret);
  // If the song is downloaded, treat it like an offline-eligible playback
  // (audio element path, no iframe) regardless of background-play mode.
  const useHybrid =
    !offlineAudioUrl && // downloaded songs supersede streaming
    proxyConfigured &&
    bgMode &&
    isYouTube &&
    !isYouTubePlaylist &&
    !!currentSong?.youtube_id;
  const proxyAudioUrl = useHybrid
    ? `${proxyUrl!.replace(/\/+$/, '')}/audio/${currentSong!.youtube_id}?s=${encodeURIComponent(proxySecret!)}&direct=1`
    : null;
  // When proxy/hybrid mode is on OR an offline blob is loaded, the iframe
  // is NOT mounted at all. Reason: iOS allows only one active audio
  // session per origin. If the iframe is loaded (even muted), iOS treats
  // *it* as the audio session owner and suspends our <audio> element
  // when the app backgrounds. By not mounting the iframe, the <audio>
  // element is the only player → iOS keeps its session alive → real
  // background play works.
  const useIframePlayer = isYouTube && !useHybrid && !offlineAudioUrl;

  // Pre-warm the proxy cache for the NEXT song in the queue. A HEAD
  // request triggers yt-dlp resolution server-side so when the song
  // actually plays, the URL is already cached on the proxy → fast start.
  useEffect(() => {
    if (!proxyConfigured || !bgMode || !proxyUrl || !proxySecret) return;
    const next = queue[queueIndex + 1]?.song;
    if (!next) return;
    if (next.source !== 'youtube_embed') return;
    if (next.youtube_kind === 'playlist') return;
    if (!next.youtube_id) return;

    const nextProxyUrl = `${proxyUrl.replace(/\/+$/, '')}/audio/${next.youtube_id}?s=${encodeURIComponent(proxySecret)}&direct=1`;
    const timer = setTimeout(() => {
      fetch(nextProxyUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueIndex, currentSong?.id, bgMode, proxyConfigured]);

  // Autoplay: when the user is on a YouTube song and the queue has <=2
  // more items after the current one, pull YouTube's Mix (algorithmic
  // radio) for the current song and append a few recommendations.
  // Refs let the effect see the latest values without re-running on every
  // tick of progress.
  const autoplayEnabled = useAutoplay((s) => s.enabled);
  const autoplayFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoplayEnabled) return;
    if (!currentSong?.youtube_id) return;
    if (currentSong.source !== 'youtube_embed') return;
    if (currentSong.youtube_kind === 'playlist') return;
    // Already filled for this song? Skip — wait for next song.
    if (autoplayFetchedFor.current === currentSong.youtube_id) return;

    const remaining = queue.length - queueIndex - 1;
    if (remaining > 2) return; // queue still has plenty — don't bother

    autoplayFetchedFor.current = currentSong.youtube_id;
    fetchRecommendations(currentSong.youtube_id).then((videos) => {
      if (videos.length === 0) return;
      const state = usePlayerStore.getState();
      const inQueue = new Set(state.queue.map((q) => q.song.id));
      const items = videosToQueueItems(videos, inQueue).slice(0, 10);
      if (items.length === 0) return;
      usePlayerStore.setState({ queue: [...state.queue, ...items] });
    });
  }, [autoplayEnabled, currentSong?.youtube_id, currentSong?.source, currentSong?.youtube_kind, queue.length, queueIndex]);

  // Surface the mini-player ONCE per new YouTube track when background mode
  // is on — so the user can reach native iOS controls. Tracked by a ref of
  // the last-seen video id so the user closing the mini doesn't auto-reopen
  // it on the same track.
  const lastBgVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bgMode || !useIframePlayer) {
      lastBgVideoIdRef.current = null;
      return;
    }
    const vid = currentSong?.youtube_id || null;
    if (vid && vid !== lastBgVideoIdRef.current) {
      lastBgVideoIdRef.current = vid;
      setYtView('mini');
    }
  }, [bgMode, useIframePlayer, currentSong?.youtube_id]);

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
    if (!ytReady || !useIframePlayer || !currentSong?.youtube_id || !ytContainerRef.current) return;

    if (ytPlayerRef.current) {
      if (isYouTubePlaylist) {
        ytPlayerRef.current.loadPlaylist({ list: currentSong.youtube_id, listType: 'playlist' });
      } else {
        ytPlayerRef.current.loadVideoById(currentSong.youtube_id);
      }
      return;
    }

    setYtError(null);
    // In background mode, surface the mini-player so the user can reach
    // the native iOS PiP button on the video itself.
    setYtView(bgMode ? 'mini' : 'hidden');

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
        // Background mode: show native YT controls so iOS Safari exposes
        // the Picture-in-Picture button on the video (only way to keep
        // YouTube audio playing when the screen is locked on iPhone).
        controls: bgMode ? 1 : 0,
        playsinline: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        ...(isYouTubePlaylist
          ? { listType: 'playlist', list: currentSong.youtube_id }
          : {}),
      },
      events: {
        onReady: (e: { target?: unknown }) => {
          const player = e.target as {
            setVolume: (v: number) => void;
            playVideo: () => void;
          };
          player.setVolume((isMuted ? 0 : volume) * 100);
          player.playVideo();
          // Grant Picture-in-Picture permission to the embed so iOS Safari
          // can auto-PiP when the user swipes the app away. The YT IFrame
          // API doesn't expose this via playerVars, so we patch the
          // generated iframe's allow attribute after it mounts.
          try {
            const iframe = wrapper.querySelector('iframe');
            if (iframe) {
              const existing = iframe.getAttribute('allow') || '';
              if (!existing.includes('picture-in-picture')) {
                iframe.setAttribute(
                  'allow',
                  [existing, 'picture-in-picture', 'autoplay', 'encrypted-media']
                    .filter(Boolean)
                    .join('; '),
                );
              }
              // Some iOS builds key off the (non-standard) attribute too.
              iframe.setAttribute('allowpictureinpicture', 'true');
              iframe.setAttribute('webkit-playsinline', 'true');
            }
          } catch {}
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
            101: "Video can't be embedded — the uploader (often a record label) has blocked third-party playback. Open on YouTube to listen.",
            150: "Video can't be embedded — the uploader (often a record label) has blocked third-party playback. Open on YouTube to listen.",
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

  // YouTube progress polling.
  // Note: we intentionally DON'T early-return when ytPlayerRef.current is
  // null. The player gets created asynchronously in a separate effect
  // (after ytReady flips), so on the first run the ref is almost always
  // empty. By starting the interval anyway and null-checking inside,
  // polling kicks in the moment the player is ready — without us having
  // to wire up another dependency that re-runs the effect.
  useEffect(() => {
    if (!isYouTube) return;
    if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);

    ytIntervalRef.current = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || typeof p.getCurrentTime !== 'function') return;
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

  // YouTube volume — only relevant when iframe is the audio source.
  useEffect(() => {
    if (!useIframePlayer || !ytPlayerRef.current) return;
    try {
      ytPlayerRef.current.setVolume((isMuted ? 0 : volume) * 100);
    } catch {}
  }, [volume, isMuted, useIframePlayer]);

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

  // Audio element src:
  //   - uploads → file_url
  //   - YT song downloaded to device → blob: URL (preferred when available,
  //                       works offline, perfect iOS background)
  //   - hybrid YT mode → proxy URL (audible; this is the actual audio source
  //                       — the iframe is muted video-only)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    const isUpload = !isYouTube;
    if (isUpload) {
      const want = currentSong.file_url || '';
      // Only set src if it changed — re-assigning the same URL would
      // restart the audio, breaking the synchronous next-track transition
      // we do in handleEnded for background play.
      if (audio.src !== want) audio.src = want;
      audio.muted = false;
      audio.volume = isMuted ? 0 : volume;
      if (isPlaying) audio.play().catch(() => {});
    } else if (offlineAudioUrl) {
      if (audio.src !== offlineAudioUrl) audio.src = offlineAudioUrl;
      audio.muted = false;
      audio.volume = isMuted ? 0 : volume;
      if (isPlaying) audio.play().catch(() => {});
    } else if (isOfflineAvailable) {
      // Song is known cached but the blob URL is still being read from
      // IndexedDB. Don't set proxy src — that would cause a brief network
      // fetch before the blob URL flips in. Just wait one tick.
      return;
    } else if (useHybrid && proxyAudioUrl) {
      if (audio.src !== proxyAudioUrl) audio.src = proxyAudioUrl;
      audio.muted = false;
      audio.volume = isMuted ? 0 : volume;
      if (isPlaying) audio.play().catch(() => {});
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, isYouTube, useHybrid, proxyAudioUrl, offlineAudioUrl, isOfflineAvailable]);

  // Audio element play/pause for upload, hybrid, AND offline-blob modes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const isUpload = !isYouTube;
    if (!isUpload && !useHybrid && !offlineAudioUrl) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, isYouTube, useHybrid, offlineAudioUrl]);

  // Audio element volume — applies whenever audio element is the source
  // (uploads OR hybrid OR offline blob).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const isUpload = !isYouTube;
    if (!isUpload && !useHybrid && !offlineAudioUrl) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted, isYouTube, useHybrid, offlineAudioUrl]);


  // Playback rate — apply to whichever player is currently audible.
  useEffect(() => {
    if (useIframePlayer && ytPlayerRef.current) {
      try { ytPlayerRef.current.setPlaybackRate(playbackRate); } catch {}
    }
    if (audioRef.current) {
      try { audioRef.current.playbackRate = playbackRate; } catch {}
    }
  }, [playbackRate, useIframePlayer, currentSong?.id]);


  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);

    // The streamed m4a from the proxy is sometimes longer than the actual
    // YouTube song (extra padding bytes / Safari's flaky duration estimate).
    // If we've locked the *real* duration from YouTube's metadata API and
    // the audio is now past it, the song is effectively over — but the
    // audio element's 'ended' event won't fire until much later. Treat it
    // as ended now so the queue advances.
    const stable = stableDurationRef.current;
    const songId = usePlayerStore.getState().currentSong?.id || null;
    if (
      stable.locked &&
      stable.songId === songId &&
      stable.value > 0 &&
      audio.currentTime >= stable.value - 0.2
    ) {
      // Force the end-of-song flow. Crucially DO NOT pause — pausing in
      // background causes iOS to deactivate the audio session, after which
      // play() on the next track is silently rejected. Going straight to
      // src swap keeps the session continuously active.
      handleEndedRef.current?.();
    }
  }, [setProgress]);

  // Forward-declared ref so handleTimeUpdate can call handleEnded without
  // creating a circular useCallback dep
  const handleEndedRef = useRef<(() => void) | null>(null);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const newDur = audio.duration;
    if (!isFinite(newDur) || newDur <= 0) return;

    const songId = usePlayerStore.getState().currentSong?.id || null;
    const stable = stableDurationRef.current;

    // If we've locked in an authoritative duration from YouTube metadata,
    // ignore everything the audio element says.
    if (stable.songId === songId && stable.locked) {
      // Still apply pendingSeek if needed
      const pending = usePlayerStore.getState().pendingSeek;
      if (pending != null && pending > 0 && stable.value > pending) {
        try { audio.currentTime = pending; } catch {}
        usePlayerStore.getState().clearPendingSeek();
      }
      return;
    }

    // First time we see a duration for this song — lock it in.
    if (stable.songId !== songId) {
      stableDurationRef.current = { songId, value: newDur, locked: false };
      setDuration(newDur);
    } else {
      // Same song, new duration estimate from the streaming audio. Accept
      // only shorter values (streaming bug only ever inflates duration).
      if (newDur < stable.value && newDur > 30) {
        stableDurationRef.current = { ...stable, value: newDur };
        setDuration(newDur);
      }
    }

    // Re-apply pendingSeek once metadata is actually loaded
    const pending = usePlayerStore.getState().pendingSeek;
    const seekTarget = stableDurationRef.current.value || newDur;
    if (pending != null && pending > 0 && seekTarget > pending) {
      try { audio.currentTime = pending; } catch {}
      usePlayerStore.getState().clearPendingSeek();
    }
  }, [setDuration]);

  // Fetch authoritative duration from YouTube Data API for YT songs.
  // This is the ground truth — the audio element's estimate can double
  // when streaming through a proxy. Once we have this value, we lock
  // and ignore anything else.
  useEffect(() => {
    if (!currentSong || !isYouTube || !currentSong.youtube_id) return;
    if (currentSong.youtube_kind === 'playlist') return;
    let cancelled = false;
    fetch(`/api/youtube-meta/${currentSong.youtube_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { duration?: number } | null) => {
        if (cancelled || !data?.duration || data.duration < 5) return;
        stableDurationRef.current = {
          songId: currentSong.id,
          value: data.duration,
          locked: true,
        };
        setDuration(data.duration);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSong?.id, isYouTube, setDuration]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }

    // In hybrid mode + background, iOS pauses the audio session the moment
    // the current track ends. The normal React effect that updates audio.src
    // to the next song runs too late — by then the session is gone and
    // audio.play() fails silently, leaving the queue stuck. Transition
    // synchronously: pick the next song, set audio.src directly, call
    // play() in the same tick so the session never goes idle.
    const audio = audioRef.current;
    const state = usePlayerStore.getState();
    const nextItem = state.queue[state.queueIndex + 1];
    // If the next song is downloaded to device, let the React path handle
    // it — it'll pull from IndexedDB. The async hop is fast enough (<100ms)
    // that iOS keeps the audio session alive without our sync transition.
    const nextOffline =
      !!nextItem && useOfflineStore.getState().ids.has(nextItem.song.id);
    const fallbackToReactPath =
      !useHybrid || !audio || !nextItem || !proxyUrl || !proxySecret ||
      nextOffline ||
      nextItem.song.source !== 'youtube_embed' ||
      nextItem.song.youtube_kind === 'playlist' ||
      !nextItem.song.youtube_id;

    if (fallbackToReactPath) {
      next();
      return;
    }

    // Sync transition for hybrid mode — keeps iOS audio session alive
    const nextSong = nextItem.song;
    const nextUrl = `${proxyUrl.replace(/\/+$/, '')}/audio/${nextSong.youtube_id}?s=${encodeURIComponent(proxySecret)}&direct=1`;

    // Explicitly tell the OS we're still playing — this is the lock-screen
    // session iOS uses to decide whether to allow continued playback. Update
    // metadata and state BEFORE the src swap so there's no window where
    // playbackState looks paused.
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: nextSong.title,
          artist: nextSong.artist_name || '',
          artwork: nextSong.cover_url
            ? [{ src: nextSong.cover_url, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      }
    } catch {}

    try {
      audio.src = nextUrl;
      // play() returns a promise; await isn't possible here (not async fn) but
      // we kick it off and the audio element will start as soon as it's ready
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // If immediate play fails, try once on canplay
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay);
            audio.play().catch(() => {});
          };
          audio.addEventListener('canplay', onCanPlay, { once: true });
        });
      }
    } catch {}
    // Update store after audio is already pointed at the new source so the
    // React effects don't re-set src (which would interrupt playback).
    usePlayerStore.setState({
      currentSong: nextSong,
      queueIndex: state.queueIndex + 1,
      progress: 0,
      isPlaying: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, next, useHybrid, proxyUrl, proxySecret]);

  // Keep ref up to date so handleTimeUpdate can call the latest handleEnded
  useEffect(() => {
    handleEndedRef.current = handleEnded;
  }, [handleEnded]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (!isFinite(time) || time < 0) return;
    // Update UI immediately so slider doesn't snap back during drag
    setProgress(time);
    if (isYouTube && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(time, true);
      } catch {}
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    // For streaming audio (proxy mode), the seekable range may not cover
    // the full duration yet. Setting currentTime triggers a fresh range
    // request — only do it when the audio is past metadata load.
    if (audio.readyState >= 1 /* HAVE_METADATA */) {
      try { audio.currentTime = time; } catch {}
    } else {
      // Audio not ready yet — queue the seek for when metadata loads
      usePlayerStore.getState().seekTo(time);
    }
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const showPlayer = isPlayerVisible && currentSong;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      {/* YT iframe — always rendered to keep iframe alive */}
      <YouTubeView
        view={useIframePlayer ? ytView : 'hidden'}
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
      {useIframePlayer && !ytError && ytView === 'hidden' && (
        <button
          onClick={() => setYtView('mini')}
          className="fixed right-3 z-40 w-9 h-9 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ bottom: 'var(--floating-bottom)' }}
          aria-label="Show video"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {/* Error popup — now dismissable */}
      {isYouTube && ytError && (
        <div
          className="fixed right-3 left-3 sm:left-auto sm:right-4 z-50 sm:max-w-[320px] bg-card border border-destructive rounded-xl p-3 shadow-2xl"
          style={{ bottom: 'var(--floating-bottom)' }}
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

      {showPlayer && currentSong && (<div className="fixed bottom-[var(--total-bottom-nav)] lg:bottom-0 left-0 lg:left-[var(--sidebar-width)] right-0 z-50 h-[var(--player-height)] glass border-t border-border animate-slide-up">
        <div
          className="absolute top-0 left-0 h-0.5 bg-accent transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />

        <div className="h-full flex items-center justify-between px-4 lg:px-6 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3 flex-1 min-w-0 lg:w-1/4">
            <button
              type="button"
              onClick={openNowPlaying}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90 transition-opacity cursor-pointer"
              aria-label="Open now playing"
            >
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
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium truncate">{currentSong.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentSong.artist_name}
                </p>
              </div>
            </button>
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
            <SpeedButton playbackRate={playbackRate} setPlaybackRate={setPlaybackRate} />
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

