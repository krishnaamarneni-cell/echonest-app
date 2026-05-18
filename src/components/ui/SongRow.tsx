'use client';

import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { useOfflineStore, isDownloadable } from '@/store/offline';
import { formatDuration } from '@/lib/utils';
import { Play, Pause, Heart, MoreHorizontal, Music, Trash2, ListPlus, Download, Check, Loader2, RotateCcw, HardDriveDownload } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu } from './Menu';
import { createClient } from '@/lib/supabase/client';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { useOwnerMode } from '@/store/ownerMode';
import { coverFor } from '@/lib/coverFor';

interface SongRowProps {
  song: Song;
  index?: number;
  showIndex?: boolean;
  songs?: Song[];
  onAddToPlaylist?: (songId: string) => void;
  onDeleted?: (songId: string) => void;
  source?: 'playlist' | 'album' | 'library';
}

export function SongRow({
  song,
  index,
  showIndex,
  songs,
  onDeleted,
  source = 'library',
}: SongRowProps) {
  const { currentSong, isPlaying, play, togglePlay } = usePlayerStore();
  const { likedIds, toggleLike, loadLikes } = useLikesStore();
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);
  const isOwner = useOwnerMode((s) => s.isOwner);
  const [isHovered, setIsHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Subscribe to the offline store so this row re-renders when its
  // download progresses or completes elsewhere (e.g. via the playlist
  // "Download all" button).
  const isOffline = useOfflineStore((s) => s.ids.has(song.id));
  const downloadProgress = useOfflineStore((s) => s.inProgress.get(song.id));
  const downloadError = useOfflineStore((s) => s.errors.get(song.id));
  const downloadSong = useOfflineStore((s) => s.downloadSong);
  const removeOffline = useOfflineStore((s) => s.remove);

  const isDownloadEligible = isDownloadable(song);

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

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return;
    setDeleting(true);

    const supabase = createClient();

    // For uploaded files, also delete the audio file from storage
    if (song.source === 'upload' && song.file_url) {
      try {
        const url = new URL(song.file_url);
        const path = url.pathname.split('/storage/v1/object/public/audio/')[1];
        if (path) {
          await supabase.storage.from('audio').remove([path]);
        }
      } catch {}
    }

    const { error } = await supabase.from('songs').delete().eq('id', song.id);
    if (error) {
      alert('Failed to delete: ' + error.message);
      setDeleting(false);
      return;
    }

    onDeleted?.(song.id);
  };

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
        isCurrentSong ? 'bg-accent-muted' : 'hover:bg-card-hover'
      } ${deleting ? 'opacity-50 pointer-events-none' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handlePlay}
    >
      <div className="w-10 flex-shrink-0 flex items-center justify-center">
        {isHovered || (isCurrentSong && isPlaying) ? (
          <button className="text-accent">
            {isCurrentSong && isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
          </button>
        ) : showIndex && index !== undefined ? (
          <span className={`text-sm ${isCurrentSong ? 'text-accent' : 'text-muted'}`}>
            {index + 1}
          </span>
        ) : (
          <div className="w-10 h-10 rounded-md bg-card overflow-hidden flex-shrink-0">
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
          </div>
        )}
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
        {isOffline ? (
          <span
            title="Downloaded to device"
            className="text-emerald-500 inline-flex items-center"
          >
            <Check className="w-3.5 h-3.5" />
          </span>
        ) : downloadProgress !== undefined ? (
          <span
            title={`Downloading ${downloadProgress}%`}
            className="text-accent inline-flex items-center"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </span>
        ) : null}
        <span className="text-xs text-muted tabular-nums w-10 text-right">
          {formatDuration(song.duration)}
        </span>
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
            ...(isOwner
              ? [
                  {
                    label: 'Delete',
                    icon: Trash2,
                    onClick: handleDelete,
                    variant: 'danger' as const,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
