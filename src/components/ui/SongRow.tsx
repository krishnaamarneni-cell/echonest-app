'use client';

import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { formatDuration } from '@/lib/utils';
import { Play, Pause, Heart, MoreHorizontal, Music, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu } from './Menu';
import { createClient } from '@/lib/supabase/client';

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
  const [isHovered, setIsHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
            {song.cover_url ? (
              <Image
                src={song.cover_url}
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
            {
              label: 'Delete',
              icon: Trash2,
              onClick: handleDelete,
              variant: 'danger',
            },
          ]}
        />
      </div>
    </div>
  );
}
