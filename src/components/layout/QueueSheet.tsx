'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/player';
import { ChevronDown, Music, X, ListMusic } from 'lucide-react';
import Image from 'next/image';

interface QueueSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QueueSheet({ open, onClose }: QueueSheetProps) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const play = usePlayerStore((s) => s.play);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  const touchStart = useRef<{ y: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const upcoming = queue.slice(queueIndex + 1);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (dy > 0) setDragY(dy);
  };

  const handleTouchEnd = () => {
    if (dragY > 100) onClose();
    else setDragY(0);
    touchStart.current = null;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      {/* Sheet */}
      <div
        className="absolute left-0 right-0 bottom-0 top-[15%] bg-card border-t border-border rounded-t-3xl shadow-2xl flex flex-col animate-slide-up"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        {/* Drag handle (touchable area) */}
        <div
          className="pt-3 pb-2 flex justify-center flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <button
            onClick={onClose}
            className="w-12 h-1.5 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60 transition-colors"
            aria-label="Close queue"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListMusic className="w-5 h-5 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Up Next
              </p>
              <p className="text-sm font-semibold truncate">
                {upcoming.length} song{upcoming.length !== 1 ? 's' : ''} queued
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Now playing row */}
        {currentSong && (
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-accent-muted/30 flex-shrink-0">
            <div className="w-10 h-10 rounded-md bg-background overflow-hidden flex-shrink-0">
              {currentSong.cover_url ? (
                <Image
                  src={currentSong.cover_url}
                  alt={currentSong.title}
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
              <p className="text-xs text-accent uppercase tracking-wider font-medium">
                Now playing
              </p>
              <p className="text-sm font-medium truncate">{currentSong.title}</p>
            </div>
          </div>
        )}

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto py-2">
          {upcoming.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Music className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No songs queued. Play something to build a queue.
              </p>
            </div>
          ) : (
            upcoming.map((item, i) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 px-4 py-2 hover:bg-card-hover transition-colors"
              >
                <span className="w-6 text-xs text-muted text-center flex-shrink-0">
                  {i + 1}
                </span>
                <button
                  onClick={() =>
                    play(
                      item.song,
                      queue.map((q) => q.song),
                      item.source as 'playlist' | 'album' | 'library',
                    )
                  }
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-10 h-10 rounded-md bg-background overflow-hidden flex-shrink-0">
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
                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="w-8 h-8 rounded-full hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  aria-label="Remove from queue"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
