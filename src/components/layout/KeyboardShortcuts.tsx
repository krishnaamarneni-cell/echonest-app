'use client';

/**
 * Global keyboard shortcuts for the music player.
 *
 * Standard music-app bindings, scoped to "no input is focused" so the
 * user can still type in search / display name / playlist title forms
 * without us hijacking their keystrokes.
 *
 *   Space   →  play/pause
 *   ←  →   →  previous / next track
 *   ↑  ↓   →  volume up / down (5% steps)
 *   M       →  mute toggle
 *   L       →  like / unlike current song
 *   S       →  shuffle toggle
 *   R       →  cycle repeat (off → all → one)
 *   ?       →  open help overlay listing the keys
 */

import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { Keyboard, X } from 'lucide-react';

const SHORTCUTS: { key: string; description: string }[] = [
  { key: 'Space', description: 'Play / pause' },
  { key: '← / →', description: 'Previous / next track' },
  { key: '↑ / ↓', description: 'Volume up / down' },
  { key: 'M', description: 'Mute toggle' },
  { key: 'L', description: 'Like / unlike current song' },
  { key: 'S', description: 'Toggle shuffle' },
  { key: 'R', description: 'Cycle repeat mode' },
  { key: '?', description: 'This shortcut list' },
];

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore if user is typing in a form / contenteditable
      if (isTypingTarget(document.activeElement)) return;
      // Ignore if a modal asks for special input (cmd/ctrl shortcuts pass through to browser)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const player = usePlayerStore.getState();
      const likes = useLikesStore.getState();

      switch (e.key) {
        case ' ':
        case 'Spacebar': {
          if (!player.currentSong) return;
          e.preventDefault();
          player.togglePlay();
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          player.next();
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          player.previous();
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + 0.05));
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - 0.05));
          return;
        }
        case 'm':
        case 'M': {
          e.preventDefault();
          player.toggleMute();
          return;
        }
        case 'l':
        case 'L': {
          if (!player.currentSong) return;
          // Like only works on real Supabase song rows, not ad-hoc YT items
          if (player.currentSong.id.startsWith('yt-')) return;
          e.preventDefault();
          likes.toggleLike(player.currentSong.id);
          return;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          player.toggleShuffle();
          return;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          player.cycleRepeat();
          return;
        }
        case '?': {
          // Shift+/ -> "?"
          e.preventDefault();
          setHelpOpen((v) => !v);
          return;
        }
        case 'Escape': {
          if (helpOpen) {
            e.preventDefault();
            setHelpOpen(false);
          }
          return;
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={() => setHelpOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-accent" />
            Keyboard shortcuts
          </h2>
          <button
            onClick={() => setHelpOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="px-2 py-1 bg-card-hover border border-border rounded text-xs font-mono tabular-nums">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-muted">
          Shortcuts are disabled while typing in any input field.
        </p>
      </div>
    </div>
  );
}
