'use client';

/**
 * Synced lyrics panel for the Now Playing screen.
 *
 * Pulls lyrics from /api/lyrics (LRCLIB) on song change, parses LRC
 * timestamps with src/lib/lyrics.ts, and auto-scrolls the active line
 * into the vertical center as the song progresses. Falls back to plain
 * (unsynced) text when LRC isn't available, and to "no lyrics found"
 * when the search returns nothing.
 */

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/player';
import { parseLrc, findActiveCue, LyricCue } from '@/lib/lyrics';
import { Loader2, Music } from 'lucide-react';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'synced'; cues: LyricCue[] }
  | { kind: 'plain'; text: string }
  | { kind: 'none' };

export function LyricsPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const progress = usePlayerStore((s) => s.progress);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const [state, setState] = useState<State>({ kind: 'idle' });
  const [activeIdx, setActiveIdx] = useState(-1);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Fetch lyrics whenever the current song changes
  useEffect(() => {
    if (!currentSong) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });

    const params = new URLSearchParams({
      track: currentSong.title || '',
      artist: currentSong.artist_name || '',
    });
    if (currentSong.album_name) params.set('album', currentSong.album_name);
    if (currentSong.duration > 0)
      params.set('duration', String(Math.round(currentSong.duration)));

    let cancelled = false;
    fetch(`/api/lyrics?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.synced) {
          setState({ kind: 'synced', cues: parseLrc(data.synced as string) });
        } else if (data?.plain) {
          setState({ kind: 'plain', text: data.plain as string });
        } else {
          setState({ kind: 'none' });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'none' });
      });

    return () => {
      cancelled = true;
    };
  }, [currentSong?.title, currentSong?.artist_name, currentSong?.album_name, currentSong?.duration]);

  // Update the active line as the song plays
  useEffect(() => {
    if (state.kind !== 'synced') return;
    const idx = findActiveCue(state.cues, progress);
    if (idx !== activeIdx) setActiveIdx(idx);
  }, [progress, state, activeIdx]);

  // Scroll the active line into view (center it)
  useEffect(() => {
    if (state.kind !== 'synced') return;
    if (activeIdx < 0) return;
    const container = scrollerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-cue-idx="${activeIdx}"]`,
    );
    if (!target) return;
    const cTop = container.scrollTop;
    const cMid = container.clientHeight / 2;
    const tTop = target.offsetTop;
    const tMid = target.offsetHeight / 2;
    container.scrollTo({
      top: tTop - cMid + tMid,
      behavior: 'smooth',
    });
  }, [activeIdx, state]);

  if (!currentSong) return null;

  return (
    <div
      ref={scrollerRef}
      className="overflow-y-auto h-full px-4 sm:px-6 py-8 [scrollbar-width:thin]"
    >
      {state.kind === 'loading' && (
        <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Looking up lyrics…
        </div>
      )}

      {state.kind === 'none' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center text-muted-foreground">
          <Music className="w-8 h-8" />
          <p className="text-sm">No lyrics found for this track.</p>
          <p className="text-xs">
            LRCLIB doesn&apos;t have a match. Try searching this song there
            and contributing the lyrics — it&apos;s a free community
            database.
          </p>
        </div>
      )}

      {state.kind === 'plain' && (
        <pre className="whitespace-pre-wrap text-base sm:text-lg font-medium leading-relaxed text-foreground/90 max-w-2xl mx-auto">
          {state.text}
        </pre>
      )}

      {state.kind === 'synced' &&
        state.cues.map((cue, i) => {
          const active = i === activeIdx;
          const past = i < activeIdx;
          return (
            <button
              key={`${cue.time}-${i}`}
              data-cue-idx={i}
              onClick={() => seekTo(cue.time)}
              className={`block w-full text-left py-1.5 px-2 rounded transition-all text-base sm:text-xl font-semibold max-w-2xl mx-auto ${
                active
                  ? 'text-foreground scale-[1.02]'
                  : past
                  ? 'text-muted-foreground/60'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              }`}
              title={active ? 'Currently playing' : 'Tap to seek here'}
            >
              {cue.text || <span className="opacity-40">♪</span>}
            </button>
          );
        })}
    </div>
  );
}
