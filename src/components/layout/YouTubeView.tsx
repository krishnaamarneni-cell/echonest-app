'use client';

import type { RefObject } from 'react';
import { Song, QueueItem } from '@/types';
import { ChevronDown, Maximize2, Minimize2, Music } from 'lucide-react';

export function YouTubeView({
  view,
  containerRef,
  currentSong,
  queue,
  queueIndex,
  onClose,
  onMini,
  onFull,
  onPlayQueueItem,
}: {
  view: 'hidden' | 'mini' | 'full';
  containerRef: RefObject<HTMLDivElement | null>;
  currentSong: Song | null;
  queue: QueueItem[];
  queueIndex: number;
  onClose: () => void;
  onMini: () => void;
  onFull: () => void;
  onPlayQueueItem: (item: QueueItem) => void;
}) {
  const isFull = view === 'full';
  const isMini = view === 'mini';
  const upcoming = queue.slice(queueIndex + 1);

  return (
    <>
      {isFull && (
        <div
          onClick={onMini}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[55] animate-fade-in"
        />
      )}

      <div
        className={
          isFull
            ? 'fixed inset-0 sm:inset-4 lg:inset-8 z-[60] flex flex-col lg:flex-row gap-4 p-3 sm:p-4 lg:p-6'
            : ''
        }
        style={
          isFull
            ? undefined
            : {
                position: 'fixed',
                right: '0.75rem',
                bottom: 'var(--floating-bottom)',
                width: isMini ? 320 : 1,
                height: isMini ? 180 : 1,
                opacity: isMini ? 1 : 0,
                pointerEvents: isMini ? 'auto' : 'none',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: isMini ? '0 10px 40px rgba(0,0,0,0.5)' : 'none',
                background: '#000',
                zIndex: 40,
              }
        }
      >
        <div
          className={
            isFull
              ? 'relative flex-1 lg:flex-[2] bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center'
              : 'w-full h-full'
          }
        >
          <div
            ref={containerRef}
            className={isFull ? 'w-full h-full' : 'w-full h-full'}
            style={{ width: '100%', height: '100%' }}
          />

          {isMini && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFull();
                }}
                className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 flex items-center justify-center text-white"
                aria-label="Expand video"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 flex items-center justify-center text-white"
                aria-label="Hide video"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {isFull && (
          <div className="lg:w-[380px] flex-1 lg:flex-none bg-card border border-border rounded-2xl overflow-hidden flex flex-col max-h-[40vh] lg:max-h-full">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Now playing
                </p>
                <p className="text-sm font-semibold truncate">
                  {currentSong?.title || ''}
                </p>
              </div>
              <button
                onClick={onMini}
                className="w-8 h-8 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {upcoming.length > 0 ? (
                <>
                  <p className="px-4 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
                    Up next ({upcoming.length})
                  </p>
                  {upcoming.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => onPlayQueueItem(item)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-card-hover transition-colors text-left"
                    >
                      <span className="w-6 text-xs text-muted text-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="w-10 h-10 rounded-md bg-background overflow-hidden flex-shrink-0">
                        {item.song.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.song.cover_url}
                            alt={item.song.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-muted" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.song.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.song.artist_name}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No songs queued. Add a YouTube playlist or play from your library to build a queue.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
