'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { formatDuration } from '@/lib/utils';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  ListPlus,
  Shuffle,
  Repeat,
  Repeat1,
  MoreHorizontal,
  ListMusic,
  Music,
  ExternalLink,
  Video,
  Image as ImageIcon,
  Users,
} from 'lucide-react';
import { useBackgroundMode } from '@/store/backgroundMode';
import { useListenAlong } from '@/store/listenAlong';
import Image from 'next/image';
import { Menu } from '@/components/ui/Menu';
import { QueueSheet } from './QueueSheet';
import { Gauge } from 'lucide-react';

export function NowPlayingScreen() {
  const {
    isNowPlayingOpen,
    closeNowPlaying,
    currentSong,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeat,
    pause,
    resume,
    next,
    previous,
    setProgress,
    toggleShuffle,
    cycleRepeat,
    queue,
    queueIndex,
    play,
    playbackRate,
    setPlaybackRate,
  } = usePlayerStore();

  const { likedIds, ytLikedVideoIds, toggleLike, toggleYouTubeLike, loadLikes } = useLikesStore();
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);

  useEffect(() => { loadLikes(); }, [loadLikes]);

  // Close on Escape
  useEffect(() => {
    if (!isNowPlayingOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNowPlaying();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isNowPlayingOpen, closeNowPlaying]);

  // Touch gestures: declared BEFORE any early return per Rules of Hooks
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const coverWrapperRef = useRef<HTMLDivElement>(null);
  const skipTransitionRef = useRef(false);
  // Vertical drag = whole-screen close gesture; horizontal = cover-only swipe
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [animatingX, setAnimatingX] = useState(false);
  const [dragKind, setDragKind] = useState<'none' | 'horizontal' | 'vertical'>('none');
  const [queueOpen, setQueueOpen] = useState(false);

  // Video-in-cover overlay. When the user taps "Watch video" we mount a
  // muted YT iframe in the cover slot for visuals while audio continues
  // from the proxy <audio> element in AudioPlayer.tsx. We MUST unmount
  // it before iOS suspends the page (visibility hidden), otherwise the
  // iframe steals the audio session and background play breaks.
  const bgMode = useBackgroundMode((s) => s.enabled);
  const [showInlineVideo, setShowInlineVideo] = useState(false);
  const joinRoom = useListenAlong((s) => s.joinRoom);

  // Create a new listen-along room with the current song and copy the link
  const startListenAlong = async () => {
    if (!currentSong) return;
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song: currentSong,
          isPlaying,
          position: progress,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.code) {
        alert(data?.error || 'Could not create room');
        return;
      }
      joinRoom(data.code);
      const link = `${window.location.origin}/listen/${data.code}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Listen with me on EchoNest',
            text: `Tap to listen along: ${link}`,
            url: link,
          });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(link);
          alert(`Room link copied:\n${link}`);
        } else {
          prompt('Share this room link:', link);
        }
      } catch {}
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start room');
    }
  };

  // Reset video mode whenever we close the screen or change song
  useEffect(() => { setShowInlineVideo(false); }, [currentSong?.id, isNowPlayingOpen]);

  // Force video off before iOS backgrounds the page — keeps audio session
  // with the <audio> element so background play survives.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => { if (document.hidden) setShowInlineVideo(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const isYouTubeSong =
    currentSong?.source === 'youtube_embed' &&
    currentSong?.youtube_kind !== 'playlist' &&
    !!currentSong?.youtube_id;
  // Only offer the video toggle when bg-mode/proxy is the audio source —
  // otherwise the regular iframe is already showing video normally.
  const offerVideoToggle = bgMode && isYouTubeSong;

  // Clear the skip-transition flag after the snap render commits
  useEffect(() => {
    if (skipTransitionRef.current) {
      // Two rAFs to ensure we clear AFTER the browser has painted with transition: none
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          skipTransitionRef.current = false;
        });
      });
    }
  });

  if (!isNowPlayingOpen || !currentSong) return null;

  const isYTPlaylist = currentSong.source === 'youtube_embed' && currentSong.youtube_kind === 'playlist';
  const isYTVideo = currentSong.source === 'youtube_embed' && currentSong.youtube_kind === 'video';
  const isAdHocYT = currentSong.id.startsWith('yt-');

  let isLiked = false;
  let onLikeClick: (() => void) | null = null;

  if (isYTPlaylist) {
    onLikeClick = null;
  } else if (isAdHocYT && currentSong.youtube_id) {
    isLiked = ytLikedVideoIds.has(currentSong.youtube_id);
    onLikeClick = () =>
      toggleYouTubeLike(
        currentSong.youtube_id!,
        currentSong.title,
        currentSong.artist_name,
        currentSong.cover_url ||
          `https://i.ytimg.com/vi/${currentSong.youtube_id}/hqdefault.jpg`,
      );
  } else if (isYTVideo && currentSong.youtube_id) {
    isLiked = likedIds.has(currentSong.id) || ytLikedVideoIds.has(currentSong.youtube_id);
    onLikeClick = () => toggleLike(currentSong.id);
  } else {
    isLiked = likedIds.has(currentSong.id);
    onLikeClick = () => toggleLike(currentSong.id);
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProgress(parseFloat(e.target.value));
  };

  const onAddToPlaylist = () => {
    if (isYTPlaylist) return;
    if (isAdHocYT && currentSong.youtube_id) {
      openPlaylistDialog({
        youtubeVideo: {
          videoId: currentSong.youtube_id,
          title: currentSong.title,
          author: currentSong.artist_name,
          thumbnail:
            currentSong.cover_url ||
            `https://i.ytimg.com/vi/${currentSong.youtube_id}/hqdefault.jpg`,
        },
        displayTitle: currentSong.title,
      });
    } else {
      openPlaylistDialog({
        songId: currentSong.id,
        displayTitle: currentSong.title,
      });
    }
  };

  const upcoming = queue.slice(queueIndex + 1, queueIndex + 6);
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (animatingX) return; // ignore during commit animation
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDragKind('none');
    // Defensive reset in case any prior gesture left state lingering
    setDragX(0);
    setDragY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current || animatingX) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;

    // Decide axis on first significant movement
    if (dragKind === 'none') {
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        setDragKind(Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal');
      }
    }

    if (dragKind === 'vertical') {
      // Track in both directions — only translate the screen for downward (close) drags
      setDragY(dy);
    } else if (dragKind === 'horizontal') {
      setDragX(dx);
    }
  };

  const handleTouchEnd = () => {
    const w = coverWrapperRef.current?.clientWidth || 320;
    const horizontalThreshold = w * 0.25;

    if (dragKind === 'vertical' && dragY > 100) {
      closeNowPlaying();
      setDragY(0);
      setDragX(0);
    } else if (dragKind === 'vertical' && dragY < -50) {
      // Swipe up → open queue sheet
      setQueueOpen(true);
      setDragY(0);
      setDragX(0);
    } else if (dragKind === 'horizontal' && Math.abs(dragX) > horizontalThreshold) {
      // Per request: swipe left → previous, swipe right → next
      // (Layout: prev cover sits to the right of current, next cover to the left)
      const goingNext = dragX > 0; // swipe right = next song
      const targetX = goingNext ? -(w + 16) : w + 16; // animate cover off the opposite side

      setAnimatingX(true);
      setDragX(targetX);

      window.setTimeout(() => {
        // The animation is now complete. We need to:
        //   1. Change the song (so the new cover loads at translateX(0))
        //   2. Reset transform to 0 in the same render
        //   3. Disable the transition for that render so the user doesn't see a snap-back
        skipTransitionRef.current = true;
        setAnimatingX(false);
        if (goingNext) next();
        else previous();
        setDragX(0);
      }, 280);
    } else {
      // Spring back — reset both axes defensively
      setDragX(0);
      setDragY(0);
    }
    setDragKind('none');
    touchStart.current = null;
  };

  // Adjacent songs for the carousel ghosts
  const prevSongInQueue = queueIndex > 0 ? queue[queueIndex - 1].song : null;
  const nextSongInQueue = queueIndex < queue.length - 1 ? queue[queueIndex + 1].song : null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-background overflow-y-auto overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      style={{
        // Only translate down (positive dragY) — up swipe is detected on release without visual drag
        transform: `translateY(${Math.max(0, dragY)}px)`,
        transition: dragY === 0 ? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 400) : 1,
      }}
    >
      {/* Background gradient blur */}
      {currentSong.cover_url && (
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage: `url(${currentSong.cover_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(80px)',
          }}
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/60 to-background" />

      <div
        className="relative min-h-full flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Drag handle — visual hint that screen is draggable */}
        <div className="flex justify-center pt-2 pb-1">
          <button
            onClick={closeNowPlaying}
            className="w-10 h-1.5 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60 transition-colors"
            aria-label="Minimize"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 pb-2">
          <button
            onClick={closeNowPlaying}
            className="w-11 h-11 rounded-full bg-card/80 backdrop-blur-md hover:bg-card-hover flex items-center justify-center text-foreground active:scale-95 transition-transform"
            aria-label="Close"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Now Playing
            </p>
          </div>
          <Menu
            align="right"
            trigger={
              <button className="w-11 h-11 rounded-full bg-card/80 backdrop-blur-md hover:bg-card-hover flex items-center justify-center text-foreground active:scale-95 transition-transform">
                <MoreHorizontal className="w-6 h-6" />
              </button>
            }
            items={[
              {
                label: 'Start listen-along',
                icon: Users,
                onClick: startListenAlong,
              },
              ...(isYTPlaylist
                ? []
                : [
                    {
                      label: 'Add to playlist',
                      icon: ListPlus,
                      onClick: onAddToPlaylist,
                    },
                  ]),
              ...(currentSong.youtube_id
                ? [
                    {
                      label: 'Open on YouTube',
                      icon: ExternalLink,
                      onClick: () => {
                        const url = isYTPlaylist
                          ? `https://www.youtube.com/playlist?list=${currentSong.youtube_id}`
                          : `https://www.youtube.com/watch?v=${currentSong.youtube_id}`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                      },
                    },
                  ]
                : []),
            ]}
          />
        </div>

        {/* Cover art — swipe-aware carousel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-4">
          <div
            ref={coverWrapperRef}
            className="relative w-full max-w-sm aspect-square select-none overflow-hidden rounded-2xl"
            // touch-action: none → my handler owns ALL touches on the cover
            // so the browser doesn't scroll the page underneath while I'm tracking the gesture
            style={{ touchAction: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => {
              // Reset everything if the OS interrupts the gesture (notification, system gesture, etc.)
              setDragX(0);
              setDragY(0);
              setDragKind('none');
              touchStart.current = null;
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${dragX}px)`,
                transition: skipTransitionRef.current
                  ? 'none'
                  : animatingX
                  ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
                  : dragX === 0
                  ? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'none',
              }}
            >
              {/* Next song (positioned LEFT — swipe right reveals it = goes NEXT) */}
              {nextSongInQueue && (
                <div
                  className="absolute top-0 w-full aspect-square rounded-2xl bg-card overflow-hidden shadow-2xl"
                  style={{ right: 'calc(100% + 16px)' }}
                >
                  {nextSongInQueue.cover_url ? (
                    <Image
                      src={nextSongInQueue.cover_url}
                      alt={nextSongInQueue.title}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
                      <Music className="w-24 h-24 text-muted" />
                    </div>
                  )}
                </div>
              )}

              {/* Current song — cover art, OR inline YouTube video when toggled */}
              <div className="relative w-full aspect-square rounded-2xl bg-black overflow-hidden shadow-2xl">
                {showInlineVideo && currentSong.youtube_id ? (
                  <iframe
                    key={currentSong.youtube_id}
                    src={`https://www.youtube.com/embed/${currentSong.youtube_id}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1`}
                    title={currentSong.title}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                  />
                ) : currentSong.cover_url ? (
                  <Image
                    src={currentSong.cover_url}
                    alt={currentSong.title}
                    width={400}
                    height={400}
                    className="w-full h-full object-cover pointer-events-none"
                    priority
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
                    <Music className="w-24 h-24 text-muted" />
                  </div>
                )}

                {offerVideoToggle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInlineVideo((v) => !v);
                    }}
                    className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/80 transition-colors"
                    aria-label={showInlineVideo ? 'Hide video' : 'Watch video'}
                  >
                    {showInlineVideo ? (
                      <>
                        <ImageIcon className="w-3.5 h-3.5" />
                        Cover
                      </>
                    ) : (
                      <>
                        <Video className="w-3.5 h-3.5" />
                        Watch video
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Previous song (positioned RIGHT — swipe left reveals it = goes PREVIOUS) */}
              {prevSongInQueue && (
                <div
                  className="absolute top-0 w-full aspect-square rounded-2xl bg-card overflow-hidden shadow-2xl"
                  style={{ left: 'calc(100% + 16px)' }}
                >
                  {prevSongInQueue.cover_url ? (
                    <Image
                      src={prevSongInQueue.cover_url}
                      alt={prevSongInQueue.title}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
                      <Music className="w-24 h-24 text-muted" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Song info */}
          <div className="w-full max-w-sm mt-8 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {currentSong.title}
              </h1>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {currentSong.artist_name}
              </p>
            </div>
            {onLikeClick && (
              <button
                onClick={onLikeClick}
                className={`p-2 transition-colors flex-shrink-0 ${
                  isLiked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-sm mt-6 space-y-2">
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={progress}
              onChange={handleSeek}
              className="w-full h-1"
              style={{
                background: `linear-gradient(to right, var(--accent) ${progressPercent}%, #27272a ${progressPercent}%)`,
              }}
            />
            <div className="flex justify-between text-xs text-muted tabular-nums">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="w-full max-w-sm mt-6 flex items-center justify-between">
            <button
              onClick={toggleShuffle}
              className={`p-2 transition-colors ${
                shuffle ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              onClick={previous}
              className="text-foreground hover:scale-105 transition-transform p-2"
              aria-label="Previous"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            <button
              onClick={isPlaying ? pause : resume}
              className="w-16 h-16 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={next}
              className="text-foreground hover:scale-105 transition-transform p-2"
              aria-label="Next"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              className={`p-2 transition-colors ${
                repeat !== 'off' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Repeat"
            >
              {repeat === 'one' ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Quick actions */}
          <div className="w-full max-w-sm mt-6 flex items-center justify-center gap-2 flex-wrap">
            <Menu
              align="left"
              trigger={
                <button
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    playbackRate !== 1
                      ? 'bg-accent text-white border-accent'
                      : 'bg-card border-border hover:bg-card-hover'
                  }`}
                  aria-label="Playback speed"
                >
                  <Gauge className="w-4 h-4" />
                  Speed: {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                </button>
              }
              items={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => ({
                label: `${rate}× ${rate === playbackRate ? '✓' : ''}`,
                onClick: () => setPlaybackRate(rate),
              }))}
            />
            {!isYTPlaylist && (
              <button
                onClick={onAddToPlaylist}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
              >
                <ListPlus className="w-4 h-4" />
                Add to playlist
              </button>
            )}
            <button
              onClick={() => setQueueOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
            >
              <ListMusic className="w-4 h-4" />
              Queue
            </button>
          </div>
        </div>

        {/* Up next preview (small list — full list in Queue sheet via swipe up) */}
        {upcoming.length > 0 && (
          <div className="px-4 sm:px-6 py-6 max-w-sm mx-auto w-full">
            <button
              onClick={() => setQueueOpen(true)}
              className="flex items-center gap-2 mb-3 hover:text-foreground transition-colors w-full"
            >
              <ListMusic className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex-1 text-left">
                Up next
              </h2>
              <span className="text-xs text-accent font-medium">View all</span>
            </button>
            <div className="space-y-1">
              {upcoming.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    play(item.song, queue.map((q) => q.song), item.source as 'playlist' | 'album' | 'library')
                  }
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-card-hover transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-md bg-card overflow-hidden flex-shrink-0">
                    {item.song.cover_url ? (
                      <Image
                        src={item.song.cover_url}
                        alt={item.song.title}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.song.artist_name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
