'use client';

import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { Play, Music, MoreVertical, Trash2, Heart, ListPlus } from 'lucide-react';
import { usePlaylistDialog } from '@/store/playlistDialog';
import { useOwnerMode } from '@/store/ownerMode';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu } from './Menu';
import { createClient } from '@/lib/supabase/client';

interface SongCardProps {
  song: Song;
  songs?: Song[];
  onDeleted?: (songId: string) => void;
}

export function SongCard({ song, songs, onDeleted }: SongCardProps) {
  const { play } = usePlayerStore();
  const { likedIds, toggleLike, loadLikes } = useLikesStore();
  const openPlaylistDialog = usePlaylistDialog((s) => s.open);
  const isOwner = useOwnerMode((s) => s.isOwner);
  const isPlaylist = song.youtube_kind === 'playlist';
  const isLiked = likedIds.has(song.id);
  const canLike = song.source !== 'youtube_embed' || song.youtube_kind === 'video';

  const ytFallback = song.youtube_id
    ? `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`
    : null;
  const initialCover = song.cover_url || ytFallback;
  const [coverSrc, setCoverSrc] = useState<string | null>(initialCover);
  useEffect(() => { setCoverSrc(song.cover_url || ytFallback); }, [song.cover_url, ytFallback]);

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play(song, songs || [song], 'library');
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${song.title}"?`)) return;
    const supabase = createClient();
    if (song.source === 'upload' && song.file_url) {
      try {
        const url = new URL(song.file_url);
        const path = url.pathname.split('/storage/v1/object/public/audio/')[1];
        if (path) await supabase.storage.from('audio').remove([path]);
      } catch {}
    }
    const { error } = await supabase.from('songs').delete().eq('id', song.id);
    if (error) {
      alert('Failed to delete: ' + error.message);
      return;
    }
    onDeleted?.(song.id);
  };

  const cardContent = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-card">
        {coverSrc ? (
          <Image
            src={coverSrc}
            alt={song.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => {
              if (coverSrc !== ytFallback && ytFallback) {
                setCoverSrc(ytFallback);
              } else {
                setCoverSrc(null);
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
            <Music className="w-12 h-12 text-muted" />
          </div>
        )}
        {song.source === 'youtube_embed' && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
            {isPlaylist ? 'PL' : 'YT'}
          </div>
        )}
        {!isPlaylist && (
          <button
            onClick={handlePlay}
            className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 hover:bg-accent-hover hover:scale-105 active:scale-95"
            aria-label="Play"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        )}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canLike && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleLike(song.id);
              }}
              className={`w-7 h-7 rounded-full backdrop-blur-md flex items-center justify-center text-white ${
                isLiked ? 'bg-accent' : 'bg-black/50 hover:bg-black/70'
              }`}
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
            </button>
          )}
          <Menu
            trigger={
              <button className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/70 flex items-center justify-center text-white">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            }
            items={[
              ...(isPlaylist
                ? []
                : [
                    {
                      label: 'Add to playlist',
                      icon: ListPlus,
                      onClick: () =>
                        openPlaylistDialog({
                          songId: song.id,
                          displayTitle: song.title,
                        }),
                    },
                  ]),
              ...(isOwner
                ? [
                    {
                      label: 'Delete',
                      icon: Trash2,
                      variant: 'danger' as const,
                      onClick: handleDelete,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
      <div className="px-1 pt-3 space-y-0.5">
        <p className="font-medium text-sm truncate">{song.title}</p>
        <p className="text-xs text-muted-foreground truncate">{song.artist_name}</p>
      </div>
    </>
  );

  if (isPlaylist) {
    return (
      <Link
        href={`/yt-playlist/${song.id}`}
        className="group block w-full"
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      onClick={handlePlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePlay(e as unknown as React.MouseEvent);
        }
      }}
      role="button"
      tabIndex={0}
      className="group block w-full text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent rounded-xl"
    >
      {cardContent}
    </div>
  );
}
