'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useListenAlong } from '@/store/listenAlong';
import { useSyncMode } from '@/store/syncMode';
import { getSyncedEngine, syncClock, getAudioContext, serverNow } from '@/lib/syncedAudio';
import type { Song } from '@/types';

// Tight room sync via the Web Audio engine. Active only when:
//   - the user is in a listen-along room, AND
//   - sync mode is enabled, AND
//   - the current room song is a YouTube video (we have proxy bytes for it).
//
// Every device (host + listeners) drives the SAME engine from the SAME room
// state on the shared server clock, so they converge to one timeline. The
// host writes the room state via ListenAlongSync; here we just read it and
// schedule. Normal <audio>/iframe playback is suppressed in this mode by
// AudioPlayer (see syncedRoomActive there) so the engine is the only sound.

function buildAudioUrl(videoId: string): string | null {
  const proxyUrl = process.env.NEXT_PUBLIC_YT_PROXY_URL;
  const proxySecret = process.env.NEXT_PUBLIC_YT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return null;
  return `${proxyUrl.replace(/\/+$/, '')}/audio/${videoId}?s=${encodeURIComponent(proxySecret)}`;
}

export function SyncedRoomPlayer() {
  const roomCode = useListenAlong((s) => s.roomCode);
  const isHost = useListenAlong((s) => s.isHost);
  const setSuppressBroadcast = useListenAlong((s) => s.setSuppressBroadcast);
  const syncEnabled = useSyncMode((s) => s.enabled);
  const nudgeMs = useSyncMode((s) => s.nudgeMs);
  const hydrateSync = useSyncMode((s) => s.hydrate);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);

  useEffect(() => { hydrateSync(); }, [hydrateSync]);

  const activeRef = useRef(false);

  // Resume the AudioContext on the first user gesture (autoplay policy).
  useEffect(() => {
    const resume = () => {
      try { getAudioContext().resume(); } catch {}
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  useEffect(() => {
    const engine = getSyncedEngine();
    if (!roomCode || !syncEnabled) {
      if (activeRef.current) { engine.stop(); activeRef.current = false; }
      return;
    }
    activeRef.current = true;
    const supabase = createClient();
    let cancelled = false;

    syncClock();

    const tick = async () => {
      engine.nudgeMs = nudgeMs;
      const { data } = await supabase
        .from('listening_rooms')
        .select('current_song, position_seconds, is_playing, last_action_at')
        .eq('code', roomCode)
        .maybeSingle();
      if (cancelled || !data) return;

      const song = (data.current_song as Song | null) || null;
      const videoId = song?.youtube_id || null;
      if (!song || !videoId || song.youtube_kind === 'playlist') {
        engine.stop();
        return;
      }
      const url = buildAudioUrl(videoId);
      if (!url) return;

      const lastAt = data.last_action_at ? new Date(data.last_action_at as string).getTime() : Date.now();
      const playStartedAtMs = lastAt - (Number(data.position_seconds) || 0) * 1000;

      await engine.sync({
        videoId,
        url,
        playStartedAtMs,
        isPlaying: !!data.is_playing,
        volume: isMuted ? 0 : volume,
      });

      // Reflect state in the player store for the UI (progress bar, etc.).
      const player = usePlayerStore.getState();
      const liveOffset = data.is_playing
        ? Math.max(0, (serverNow() - playStartedAtMs) / 1000)
        : Number(data.position_seconds) || 0;

      if (!isHost) {
        // Listeners mirror the room into the store (their controls are locked).
        setSuppressBroadcast(true);
        try {
          if (!player.currentSong || player.currentSong.id !== song.id) {
            usePlayerStore.setState({ currentSong: song, isPlayerVisible: true });
          }
          usePlayerStore.setState({ isPlaying: !!data.is_playing, progress: liveOffset });
        } finally {
          setTimeout(() => setSuppressBroadcast(false), 50);
        }
      } else {
        // Host keeps its own song/play state; just advance the progress bar.
        usePlayerStore.setState({ progress: liveOffset });
      }
    };

    tick();
    const interval = setInterval(tick, 300);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, syncEnabled, isHost, nudgeMs, volume, isMuted]);

  return null;
}
