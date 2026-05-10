'use client';

import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { formatDuration } from '@/lib/utils';
import { Play, Pause, Heart, MoreHorizontal, Music } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';

interface SongRowProps {
  song: Song;
  index?: number;
  showIndex?: boolean;
  songs?: Song[];
  isLiked?: boolean;
  onLike?: (songId: string) => void;
  onAddToPlaylist?: (songId: string) => void;
  source?: 'playlist' | 'album' | 'library';
}

export function SongRow({
  song,
  index,
  showIndex,
  songs,
  isLiked,
  onLike,
  source = 'library',
}: SongRowProps) {
  const { currentSong, isPlaying, play, togglePlay } = usePlayerStore();
  const [isHovered, setIsHovered] = useState(false);
  const isCurrentSong = currentSong?.id === song.id;

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
        isCurrentSong
          ? 'bg-accent-muted'
          : 'hover:bg-card-hover'
      }`}
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
        {onLike && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLike(song.id);
            }}
            className={`opacity-0 group-hover:opacity-100 transition-opacity ${
              isLiked ? 'text-accent opacity-100' : 'text-muted-foreground'
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          </button>
        )}
        <span className="text-xs text-muted tabular-nums w-10 text-right">
          {formatDuration(song.duration)}
        </span>
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
