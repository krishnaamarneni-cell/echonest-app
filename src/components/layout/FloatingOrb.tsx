'use client';

/**
 * The draggable orb.
 *
 * Drag it anywhere; on release it snaps to the nearer side and stays at the
 * height you left it, across reloads. That is the familiar chat-head
 * behaviour, and it matters here because the one spot a fixed button can
 * never avoid is whatever you happen to be reaching for underneath it.
 *
 * Position is written straight to the element's style rather than held in
 * React state. Two reasons, both load-bearing:
 *
 *  - A pointermove fires dozens of times a second. Re-rendering per move
 *    would make the drag feel heavy for no benefit; nothing else on the
 *    page cares where the orb is.
 *  - Restoring a saved position through state would mean either reading
 *    localStorage during render (which the server cannot do, so hydration
 *    would mismatch) or setting state in an effect (which would flash at
 *    the default spot first). A callback ref runs after the node attaches
 *    but before paint, so the saved position is simply there.
 */

import { useCallback, useEffect, useRef } from 'react';
import { VoiceOrb } from '@/components/ui/VoiceOrb';

const SIZE = 64;
const EDGE = 12;
/** Movement beyond this is a drag; anything less is a tap. */
const DRAG_SLOP = 6;
const KEY = 'echonest-voice-orb-pos';

interface Pos {
  side: 'left' | 'right';
  /** Height as a fraction of the viewport, so it survives rotation. */
  yPct: number;
}

const DEFAULT_POS: Pos = { side: 'right', yPct: 0.66 };

function readPos(): Pos {
  if (typeof window === 'undefined') return DEFAULT_POS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_POS;
    const p = JSON.parse(raw) as Partial<Pos>;
    if (
      (p.side === 'left' || p.side === 'right') &&
      typeof p.yPct === 'number' &&
      p.yPct >= 0 &&
      p.yPct <= 1
    ) {
      return { side: p.side, yPct: p.yPct };
    }
  } catch {
    // Unreadable or malformed storage — the default is fine.
  }
  return DEFAULT_POS;
}

function clampTop(top: number): number {
  if (typeof window === 'undefined') return top;
  // Kept clear of the very top so it never lands under the status bar or
  // a page header, and never half off the bottom.
  const min = 64;
  const max = Math.max(min, window.innerHeight - SIZE - 12);
  return Math.min(Math.max(top, min), max);
}

function apply(el: HTMLElement, pos: Pos, animate: boolean) {
  const left = pos.side === 'left' ? EDGE : window.innerWidth - SIZE - EDGE;
  const top = clampTop(pos.yPct * window.innerHeight);
  el.style.transition = animate
    ? 'left 240ms cubic-bezier(.2,.8,.3,1), top 240ms cubic-bezier(.2,.8,.3,1)'
    : 'none';
  // The pre-hydration markup positions with right/bottom so the orb is in
  // a sensible place before this ever runs. Clear those or the element
  // would be constrained from both sides at once.
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

interface FloatingOrbProps {
  active?: boolean;
  busy?: boolean;
  onTap: () => void;
}

export function FloatingOrb({ active, busy, onTap }: FloatingOrbProps) {
  const elRef = useRef<HTMLButtonElement | null>(null);
  const posRef = useRef<Pos>(DEFAULT_POS);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);

  const setRef = useCallback((el: HTMLButtonElement | null) => {
    elRef.current = el;
    if (!el) return;
    posRef.current = readPos();
    apply(el, posRef.current, false);
  }, []);

  // Keep it on screen when the window changes shape. No state involved, so
  // this is a plain listener rather than anything that re-renders.
  useEffect(() => {
    const reflow = () => {
      const el = elRef.current;
      if (el) apply(el, posRef.current, false);
    };
    window.addEventListener('resize', reflow);
    window.addEventListener('orientationchange', reflow);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('orientationchange', reflow);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    // Capture so the drag survives the pointer leaving the 64px button,
    // which it does almost immediately.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Capture unsupported; the drag still works while over the element.
    }
    el.style.transition = 'none';
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: el.offsetLeft,
      originTop: el.offsetTop,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Below the slop this is still a tap, so don't start moving — a finger
    // never holds perfectly still and the orb would jitter under it.
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    d.moved = true;
    const el = e.currentTarget;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = `${d.originLeft + dx}px`;
    el.style.top = `${d.originTop + dy}px`;
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    const el = e.currentTarget;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // Never captured.
    }
    if (!d) return;

    if (!d.moved) {
      onTap();
      return;
    }

    const side: Pos['side'] =
      el.offsetLeft + SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const pos: Pos = {
      side,
      yPct: clampTop(el.offsetTop) / window.innerHeight,
    };
    posRef.current = pos;
    apply(el, pos, true);
    try {
      localStorage.setItem(KEY, JSON.stringify(pos));
    } catch {
      // Private mode or blocked storage: it just won't be remembered.
    }
  };

  return (
    <button
      ref={setRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Ask EchoNest"
      className="fixed z-[70] select-none active:scale-95"
      style={{
        // Where it sits before the ref callback runs, and if JS never
        // arrives at all. apply() swaps to left/top on mount.
        right: `${EDGE}px`,
        bottom: 'calc(var(--floating-bottom) + 48px)',
        width: SIZE,
        height: SIZE,
        // Without this the browser claims the gesture for scrolling and
        // pointermove stops arriving mid-drag.
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <VoiceOrb size={SIZE} active={active} busy={busy} className="h-full w-full" />
    </button>
  );
}
