'use client';

import { useEffect } from 'react';
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
} from 'lucide-react';
import Image from 'next/image';
import { Menu } from '@/components/ui/Menu';

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

  return (
    <div
      className="fixed inset-0 z-[80] bg-background animate-slide-up overflow-y-auto"
      role="dialog"
      aria-modal="true"
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

      <div className="relative min-h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6">
          <button
            onClick={closeNowPlaying}
            className="w-10 h-10 rounded-full hover:bg-card-hover flex items-center justify-center text-foreground"
            aria-label="Close"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Now Playing
            </p>
          </div>
          <Menu
            align="right"
            trigger={
              <button className="w-10 h-10 rounded-full hover:bg-card-hover flex items-center justify-center text-foreground">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            }
            items={[
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

        {/* Cover art */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-4">
          <div className="w-full max-w-sm aspect-square rounded-2xl bg-card overflow-hidden shadow-2xl">
            {currentSong.cover_url ? (
              <Image
                src={currentSong.cover_url}
                alt={currentSong.title}
                width={400}
                height={400}
                className="w-full h-full object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
                <Music className="w-24 h-24 text-muted" />
              </div>
            )}
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
          {!isYTPlaylist && (
            <div className="w-full max-w-sm mt-6 flex items-center justify-center gap-2">
              <button
                onClick={onAddToPlaylist}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
              >
                <ListPlus className="w-4 h-4" />
                Add to playlist
              </button>
            </div>
          )}
        </div>

        {/* Up next */}
        {upcoming.length > 0 && (
          <div className="px-4 sm:px-6 py-6 max-w-sm mx-auto w-full">
            <div className="flex items-center gap-2 mb-3">
              <ListMusic className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Up next
              </h2>
            </div>
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
    </div>
  );
}
