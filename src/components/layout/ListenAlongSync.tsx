'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useListenAlong } from '@/store/listenAlong';
import type { Song } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Mounts once at the app shell. Two modes:
//   HOST: broadcasts the local player's state so peers stay synced.
//   LISTENER: applies the host's broadcasts to the local player; its own
//   play/pause/skip do NOT broadcast.
//
// IMPORTANT: host and listeners share ONE realtime channel (channelRef). An
// earlier version created a second channel just for sending, which could fail
// to deliver — so pause/play didn't always reach listeners.

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
  const suppressBroadcast = useListenAlong((s) => s.suppressBroadcast);

  const userIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Subscribe to the room channel (used for BOTH receiving and sending).
  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    const channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: roomCode } },
    });
    channelRef.current = channel;

    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id || null;
    })();

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isHost) return; // host ignores echoes
      const p = payload as Partial<RoomState>;
      if (!p) return;
      const player = usePlayerStore.getState();

      // Where is the host RIGHT NOW (compensate for transit time)?
      let effectivePos = typeof p.position === 'number' ? p.position : null;
      if (effectivePos != null && p.isPlaying && typeof p.at === 'number') {
        const elapsedSec = Math.max(0, (Date.now() - p.at) / 1000);
        effectivePos = effectivePos + elapsedSec;
      }

      setSuppressBroadcast(true);
      try {
        if (p.song && p.song.id !== player.currentSong?.id) {
          player.play(p.song, [p.song], 'library');
          if (effectivePos != null) {
            setTimeout(() => usePlayerStore.getState().seekTo(effectivePos!), 400);
          }
        } else if (effectivePos != null) {
          const drift = Math.abs(player.progress - effectivePos);
          if (drift > 0.75) player.seekTo(effectivePos);
        }
        // Apply play/pause AFTER song handling so a pause always lands.
        if (typeof p.isPlaying === 'boolean' && p.isPlaying !== usePlayerStore.getState().isPlaying) {
          if (p.isPlaying) player.resume();
          else player.pause();
        }
      } finally {
        setTimeout(() => setSuppressBroadcast(false), 60);
      }
    });

    channel.on('presence', { event: 'sync' }, () => {
      setPeerCount(Object.keys(channel.presenceState()).length);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try { await channel.track({ joined_at: Date.now(), host: isHost }); } catch {}
      }
    });

    return () => {
      try { channel.unsubscribe(); } catch {}
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost]);

  // HOST: broadcast on state change + periodic position updates. Sends on the
  // SAME subscribed channel (channelRef) so delivery is reliable.
  useEffect(() => {
    if (!roomCode || !isHost || suppressBroadcast || !currentSong) return;
    const supabase = createClient();

    const broadcastNow = () => {
      const player = usePlayerStore.getState();
      const payload: RoomState = {
        song: player.currentSong,
        isPlaying: player.isPlaying,
        position: player.progress,
        at: Date.now(),
        by: userIdRef.current || 'unknown',
      };
      channelRef.current?.send({ type: 'broadcast', event: 'state', payload }).catch(() => {});
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

    // Fire immediately for state changes (song / play / pause), so a pause
    // reaches listeners right away.
    broadcastNow();

    // While playing, keep listeners synced. Compensation handles transit lag.
    const interval = isPlaying ? setInterval(broadcastNow, 1000) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost, currentSong?.id, isPlaying, suppressBroadcast]);

  return null;
}
