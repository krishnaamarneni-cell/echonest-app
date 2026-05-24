'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useListenAlong } from '@/store/listenAlong';
import type { Song } from '@/types';

// Listen-along sync — DB-backed for reliability.
//   HOST: writes its player state (song / position / play-pause) to the
//   listening_rooms row on every change + ~1s while playing.
//   LISTENER: polls that row ~1.5s and applies it (with transit-time
//   compensation), so host play/pause/skip reliably control all listeners.
// A separate presence channel only tracks the peer count.

export function ListenAlongSync() {
  const roomCode = useListenAlong((s) => s.roomCode);
  const isHost = useListenAlong((s) => s.isHost);
  const setPeerCount = useListenAlong((s) => s.setPeerCount);
  const setSuppressBroadcast = useListenAlong((s) => s.setSuppressBroadcast);

  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const userIdRef = useRef<string | null>(null);
  // serverNow() ≈ Date.now() + clockOffset. Estimated against the DB clock so
  // host + listeners share ONE timeline (kills inter-device clock skew).
  const clockOffsetRef = useRef(0);
  const serverNow = () => Date.now() + clockOffsetRef.current;

  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id || null;

      // Estimate offset to the server clock with a few round-trips; take the
      // median to shrug off jittery samples.
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = Date.now();
        const { data: ms, error } = await supabase.rpc('server_now_ms');
        const t1 = Date.now();
        if (cancelled) return;
        if (error || ms == null) continue;
        const serverAtT1 = Number(ms) + (t1 - t0) / 2; // server time at t1
        samples.push(serverAtT1 - t1);
      }
      if (!cancelled && samples.length) {
        samples.sort((a, b) => a - b);
        clockOffsetRef.current = samples[Math.floor(samples.length / 2)];
      }
    })();
    return () => { cancelled = true; };
  }, [roomCode]);

  // Presence channel — peer count only (subscribe-only, reliable).
  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    const channel = supabase.channel(`room-presence:${roomCode}`, {
      config: { presence: { key: roomCode } },
    });
    channel.on('presence', { event: 'sync' }, () => {
      setPeerCount(Object.keys(channel.presenceState()).length);
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try { await channel.track({ joined_at: Date.now(), host: isHost }); } catch {}
      }
    });
    return () => { try { channel.unsubscribe(); } catch {} };
  }, [roomCode, isHost, setPeerCount]);

  // HOST: write current state to the room row.
  useEffect(() => {
    if (!roomCode || !isHost || !currentSong) return;
    const supabase = createClient();

    const writeState = () => {
      const player = usePlayerStore.getState();
      supabase
        .from('listening_rooms')
        .update({
          current_song: player.currentSong,
          position_seconds: player.progress,
          is_playing: player.isPlaying,
          last_action_by: userIdRef.current,
          // Stamp with the shared server clock, not this device's local clock.
          last_action_at: new Date(serverNow()).toISOString(),
        })
        .eq('code', roomCode)
        .then(() => {}, () => {});
    };

    writeState(); // immediate on song/play/pause change
    const interval = isPlaying ? setInterval(writeState, 1000) : null;
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost, currentSong?.id, isPlaying]);

  // LISTENER: poll the room row and apply it.
  useEffect(() => {
    if (!roomCode || isHost) return;
    const supabase = createClient();
    let cancelled = false;

    const applyState = async () => {
      const { data } = await supabase
        .from('listening_rooms')
        .select('current_song, position_seconds, is_playing, last_action_at')
        .eq('code', roomCode)
        .maybeSingle();
      if (cancelled || !data) return;

      const player = usePlayerStore.getState();
      const song = (data.current_song as Song | null) || null;
      const at = data.last_action_at ? new Date(data.last_action_at as string).getTime() : 0;
      let pos = Number(data.position_seconds) || 0;
      if (data.is_playing && at) {
        // Elapsed since the host's stamp, measured on the SHARED server clock
        // (both sides use serverNow), plus a small look-ahead for the
        // listener's own seek/buffer latency so it lands ON the host's spot.
        const LISTENER_LATENCY = 0.45;
        pos += Math.max(0, (serverNow() - at) / 1000) + LISTENER_LATENCY;
      }

      setSuppressBroadcast(true);
      try {
        if (song && song.id !== player.currentSong?.id) {
          player.play(song, [song], 'library');
          setTimeout(() => usePlayerStore.getState().seekTo(pos), 400);
        } else if (song) {
          // Keep playing position in sync; re-seek on noticeable drift.
          // (Re-seeking too eagerly causes buffer stutter on streamed audio.)
          if (player.isPlaying && Math.abs(player.progress - pos) > 0.7) {
            player.seekTo(pos);
          }
        }
        // Mirror host play/pause.
        if (
          typeof data.is_playing === 'boolean' &&
          data.is_playing !== usePlayerStore.getState().isPlaying
        ) {
          if (data.is_playing) player.resume();
          else player.pause();
        }
      } finally {
        setTimeout(() => setSuppressBroadcast(false), 60);
      }
    };

    applyState();
    const interval = setInterval(applyState, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost]);

  return null;
}
