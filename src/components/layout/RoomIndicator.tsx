'use client';

import { useEffect, useRef, useState } from 'react';
import { useListenAlong } from '@/store/listenAlong';
import { X, Radio, Volume2 } from 'lucide-react';

// Small pill that floats above the player when you're in a listen-along
// room, no matter what page you're on. Tap to leave.
// Also shows toast-style hints when peers join or leave.
export function RoomIndicator() {
  const roomCode = useListenAlong((s) => s.roomCode);
  const isHost = useListenAlong((s) => s.isHost);
  const peerCount = useListenAlong((s) => s.peerCount);
  const leaveRoom = useListenAlong((s) => s.leaveRoom);
  const lastPeerRef = useRef<number>(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) {
      lastPeerRef.current = 0;
      return;
    }
    const prev = lastPeerRef.current;
    if (peerCount > prev && prev > 0) {
      setToast('Someone joined the room');
    } else if (peerCount < prev && peerCount >= 0) {
      setToast('Someone left the room');
    }
    lastPeerRef.current = peerCount;
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerCount, roomCode]);

  if (!roomCode) return null;

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-accent text-white text-xs font-medium flex items-center gap-2 shadow-lg shadow-accent/30 animate-fade-in"
        style={{ bottom: 'calc(var(--floating-bottom) + 8px)' }}
      >
        {isHost ? (
          <Radio className="w-3.5 h-3.5" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}
        {isHost ? `Hosting ${roomCode}` : `Speaker · ${roomCode}`}
        {peerCount > 0 && (
          <span className="opacity-80">
            · {peerCount} {peerCount === 1 ? 'in room' : 'in room'}
          </span>
        )}
        <button
          type="button"
          onClick={leaveRoom}
          className="ml-1 w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          aria-label="Leave room"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-card border border-border text-xs shadow-xl animate-fade-in"
          style={{ bottom: 'calc(var(--floating-bottom) + 56px)' }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
