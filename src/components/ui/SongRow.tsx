'use client';

import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { useOfflineStore, isDownloadable } from '@/store/offline';

import { Play, Pause, Heart, MoreHorizontal, Music, ListPlus, Download, Loader2, RotateCcw, HardDriveDownload, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu } from './Menu';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { coverFor } from '@/lib/coverFor';
import { createClient } from '@/lib/supabase/client';

interface SongRowProps {
  song: Song;
  index?: number;
  showIndex?: boolean;
  songs?: Song[];
  onAddToPlaylist?: (songId: string) => void;
  // Retained for caller compatibility; the read-only library has no delete.
  onDeleted?: (songId: string) => void;
  source?: 'playlist' | 'album' | 'library';
  /** Required for "Remove from playlist" — which playlist this row is in. */
  playlistId?: string;
  /** Called after a successful removal so the caller can drop the row. */
  onRemoved?: (songId: string) => void;
  /** Hide the duration cell — it costs width the title needs more. */
  /** Small badge rendered where the duration would be (e.g. "18 plays"). */
  trailing?: React.ReactNode;
}

export function SongRow({
  song,
  songs,
  source = 'library',
  playlistId,
  onRemoved,
  trailing,
}: SongRowProps) {
  const { currentSong, isPlaying, play, togglePlay } = usePlayerStore();
  const { likedIds, toggleLike, loadLikes } = useLikesStore();
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);
  const [isHovered, setIsHovered] = useState(false);

  // Subscribe to the offline store so this row re-renders when its
  // download progresses or completes elsewhere (e.g. via the playlist
  // "Download all" button).
  const isOffline = useOfflineStore((s) => s.ids.has(song.id));
  const downloadProgress = useOfflineStore((s) => s.inProgress.get(song.id));
  const downloadError = useOfflineStore((s) => s.errors.get(song.id));
  const downloadSong = useOfflineStore((s) => s.downloadSong);
  const removeOffline = useOfflineStore((s) => s.remove);

  const isDownloadEligible = isDownloadable(song);

  // Remove this song from the playlist it's being shown in. RLS scopes the
  // delete to playlists the caller owns, so no extra ownership check is
  // needed here. Only the join row goes — the song itself stays in the
  // library and in any other playlist.
  const removeFromPlaylist = async () => {
    if (!playlistId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('song_id', song.id);
    if (!error) onRemoved?.(song.id);
  };

  const requestDownload = async () => {
    try {
      await downloadSong(song);
    } catch (e) {
      // store has already captured the error message; just surface to user
      const msg = e instanceof Error ? e.message : 'Download failed';
      alert(`Download failed: ${msg}`);
    }
  };
  const isCurrentSong = currentSong?.id === song.id;
  const isLiked = likedIds.has(song.id);

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const handlePlay = () => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      play(song, songs || [song], source);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
        isCurrentSong ? 'bg-accent-muted' : 'hover:bg-card-hover'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handlePlay}
    >
      {/* Artwork always, with play/pause layered over it on hover. The old
          layout swapped artwork OUT for a track number, which cost a visual
          anchor and gave nothing back. */}
      <div className="relative w-10 h-10 flex-shrink-0 rounded-md bg-card overflow-hidden">
        {coverFor(song) ? (
          <Image
            src={coverFor(song)!}
            alt={song.title}
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4 text-muted" />
          </div>
        )}
        {isHovered || (isCurrentSong && isPlaying) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            {isCurrentSong && isPlaying ? (
              <Pause className="w-4 h-4 fill-current text-white" />
            ) : (
              <Play className="w-4 h-4 fill-current text-white" />
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrentSong ? 'text-accent' : ''}`}>
          {song.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{song.artist_name}</p>
      </div>

      <div className="flex items-center gap-2">
        {song.source !== 'youtube_embed' || song.youtube_kind === 'video' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(song.id);
            }}
            className={`transition-colors p-1 ${
              isLiked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={isLiked ? 'Unlike' : 'Like'}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          </button>
        ) : null}
        {/* Download state lives in the 22EF menu now 2014 a tick on every row was
            noise once most of a library is downloaded. An in-progress spinner
            still shows, since that one is transient and worth seeing. */}
        {downloadProgress !== undefined ? (
          <span
            title={`Downloading ${downloadProgress}%`}
            className="text-accent inline-flex items-center"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </span>
        ) : null}
        {trailing ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{trailing}</span>
        ) : null}
        <Menu
          trigger={
            <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          }
          items={[
            ...(song.youtube_kind === 'playlist'
              ? []
              : [
                  {
                    label: 'Add to playlist',
                    icon: ListPlus,
                    onClick: () =>
                      openPlaylistDialog({
                        songId: song.id,
                        displayTitle: song.title,
                        ...(song.id.startsWith('yt-') && song.youtube_id
                          ? {
                              songId: undefined,
                              youtubeVideo: {
                                videoId: song.youtube_id,
                                title: song.title,
                                author: song.artist_name,
                                thumbnail:
                                  song.cover_url ||
                                  `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`,
                              },
                            }
                          : {}),
                      }),
                  },
                ]),
            ...(isDownloadEligible
              ? [
                  isOffline
                    ? {
                        label: 'Remove download',
                        icon: HardDriveDownload,
                        onClick: () => removeOffline(song.id),
                      }
                    : downloadProgress !== undefined
                    ? {
                        label: `Downloading… ${downloadProgress}%`,
                        icon: Loader2,
                        onClick: () => {},
                        disabled: true,
                      }
                    : downloadError
                    ? {
                        label: 'Retry download',
                        icon: RotateCcw,
                        onClick: requestDownload,
                      }
                    : {
                        label: 'Download to device',
                        icon: Download,
                        onClick: requestDownload,
                      },
                ]
              : []),
            ...(isLiked
              ? [
                  {
                    label: 'Remove from Liked Songs',
                    icon: Heart,
                    onClick: () => toggleLike(song.id),
                  },
                ]
              : []),
            ...(source === 'playlist' && playlistId
              ? [
                  {
                    label: 'Remove from playlist',
                    icon: Trash2,
                    variant: 'danger' as const,
                    onClick: removeFromPlaylist,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
