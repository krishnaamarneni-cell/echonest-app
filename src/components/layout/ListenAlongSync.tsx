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

  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id || null;
    })();
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
          last_action_at: new Date().toISOString(),
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
      if (data.is_playing && at) pos += Math.max(0, (Date.now() - at) / 1000);

      setSuppressBroadcast(true);
      try {
        if (song && song.id !== player.currentSong?.id) {
          player.play(song, [song], 'library');
          setTimeout(() => usePlayerStore.getState().seekTo(pos), 400);
        } else if (song) {
          // Keep playing position in sync; only re-seek on noticeable drift.
          if (player.isPlaying && Math.abs(player.progress - pos) > 1.2) {
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
    const interval = setInterval(applyState, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost]);

  return null;
}
