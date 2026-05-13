'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useListenAlong } from '@/store/listenAlong';
import type { Song } from '@/types';

// Mounts once at the app shell. Two modes:
//
//   HOST: broadcasts the local player's state at high frequency so peers
//   stay synced. Persists state to the room row in the DB so late
//   joiners can compute the right starting position.
//
//   LISTENER: receives the host's broadcasts and applies them to the
//   local player. The listener's own play/pause/skip do NOT broadcast.
//   Effectively, the listener is a passive speaker for the host's DJ
//   session.

type RoomState = {
  song: Song | null;
  isPlaying: boolean;
  position: number;
  at: number;
  by: string;
};

export function ListenAlongSync() {
  const roomCode = useListenAlong((s) => s.roomCode);
  const isHost = useListenAlong((s) => s.isHost);
  const setPeerCount = useListenAlong((s) => s.setPeerCount);
  const setSuppressBroadcast = useListenAlong((s) => s.setSuppressBroadcast);

  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progress = usePlayerStore((s) => s.progress);
  const suppressBroadcast = useListenAlong((s) => s.suppressBroadcast);

  const userIdRef = useRef<string | null>(null);

  // Subscribe / unsubscribe to the room channel (both modes)
  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    let channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: roomCode } },
    });

    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id || null;
    })();

    // Listeners apply incoming state from the host
    channel = channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isHost) return; // host ignores any echoes
      const p = payload as Partial<RoomState>;
      if (!p) return;
      const player = usePlayerStore.getState();
      setSuppressBroadcast(true);
      try {
        if (p.song && p.song.id !== player.currentSong?.id) {
          player.play(p.song, [p.song], 'library');
          // After the new song mounts, jump to the host's position
          if (typeof p.position === 'number') {
            setTimeout(() => player.seekTo(p.position!), 400);
          }
        } else if (typeof p.position === 'number') {
          // Tight drift correction: 0.4s threshold (was 0.8s)
          const drift = Math.abs(player.progress - p.position);
          if (drift > 0.4) player.seekTo(p.position);
        }
        if (typeof p.isPlaying === 'boolean' && p.isPlaying !== player.isPlaying) {
          if (p.isPlaying) player.resume();
          else player.pause();
        }
      } finally {
        setTimeout(() => setSuppressBroadcast(false), 50);
      }
    });

    channel = channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      setPeerCount(Object.keys(state).length);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({
            joined_at: Date.now(),
            host: isHost,
          });
        } catch {}
      }
    });

    return () => {
      try { channel.unsubscribe(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost]);

  // HOST: broadcast on state change + periodic position updates so
  // listeners stay tightly synced and late joiners have fresh state.
  const sendTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!roomCode || !isHost || suppressBroadcast || !currentSong) return;
    const supabase = createClient();
    const channel = supabase.channel(`room:${roomCode}`);

    const broadcastNow = () => {
      const player = usePlayerStore.getState();
      const payload: RoomState = {
        song: player.currentSong,
        isPlaying: player.isPlaying,
        position: player.progress,
        at: Date.now(),
        by: userIdRef.current || 'unknown',
      };
      channel.send({ type: 'broadcast', event: 'state', payload }).catch(() => {});
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

    // Fire immediately for state changes
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(broadcastNow, 100);

    // While playing, also re-sync position every 750ms so listeners
    // don't drift. Pause clears this.
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      interval = setInterval(broadcastNow, 750);
    }

    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost, currentSong?.id, isPlaying, suppressBroadcast]);

  return null;
}
