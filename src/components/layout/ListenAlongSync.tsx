'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useListenAlong } from '@/store/listenAlong';
import type { Song } from '@/types';

// Mounts once at the app shell. When the user is in a listen-along room
// it (a) subscribes to the room's broadcast channel and applies incoming
// state, and (b) re-broadcasts the local player's mutations so peers
// stay in sync.

type RoomState = {
  song: Song | null;
  isPlaying: boolean;
  position: number;
  at: number; // server-style timestamp from sender
  by: string; // user id of sender
};

export function ListenAlongSync() {
  const roomCode = useListenAlong((s) => s.roomCode);
  const setPeerCount = useListenAlong((s) => s.setPeerCount);
  const setSuppressBroadcast = useListenAlong((s) => s.setSuppressBroadcast);

  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progress = usePlayerStore((s) => s.progress);
  const suppressBroadcast = useListenAlong((s) => s.suppressBroadcast);

  // Debounce send: don't flood the channel on every tick. We coalesce
  // rapid changes with a small timeout.
  const sendTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<{ songId?: string; playing?: boolean; pos?: number } | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Subscribe / unsubscribe to the room channel
  useEffect(() => {
    if (!roomCode) return;
    const supabase = createClient();
    let channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: roomCode } },
    });

    // Fetch user id once
    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id || null;
    })();

    // Apply remote state to local player
    channel = channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload as Partial<RoomState>;
      if (!p) return;
      const player = usePlayerStore.getState();
      setSuppressBroadcast(true);
      try {
        // Different song → swap
        if (p.song && p.song.id !== player.currentSong?.id) {
          player.play(p.song, [p.song], 'library');
        }
        // Sync playing state
        if (typeof p.isPlaying === 'boolean' && p.isPlaying !== player.isPlaying) {
          if (p.isPlaying) player.resume();
          else player.pause();
        }
        // Snap to position if drift > 0.8s. Use seekTo so the audio
        // element / iframe actually jumps, not just the visual.
        if (typeof p.position === 'number') {
          const drift = Math.abs(player.progress - p.position);
          if (drift > 0.8) {
            player.seekTo(p.position);
          }
        }
      } finally {
        setTimeout(() => setSuppressBroadcast(false), 50);
      }
    });

    // Presence
    channel = channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const count = Object.keys(state).length;
      setPeerCount(count);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try { await channel.track({ joined_at: Date.now() }); } catch {}
      }
    });

    return () => {
      try { channel.unsubscribe(); } catch {}
    };
  }, [roomCode, setPeerCount, setSuppressBroadcast]);

  // Local player → broadcast outbound (debounced)
  useEffect(() => {
    if (!roomCode || suppressBroadcast) return;
    if (!currentSong) return;

    const supabase = createClient();
    const channel = supabase.channel(`room:${roomCode}`);

    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => {
      const payload: RoomState = {
        song: currentSong,
        isPlaying,
        position: progress,
        at: Date.now(),
        by: userIdRef.current || 'unknown',
      };
      channel.send({ type: 'broadcast', event: 'state', payload }).catch(() => {});
      // Also persist to DB so late joiners can compute the effective
      // current position from `position_seconds + (now - last_action_at)`.
      supabase
        .from('listening_rooms')
        .update({
          current_song: currentSong,
          position_seconds: progress,
          is_playing: isPlaying,
          last_action_by: userIdRef.current,
          last_action_at: new Date().toISOString(),
        })
        .eq('code', roomCode)
        .then(() => {}, () => {});
    }, 250);

    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    };
    // Only re-fire when meaningful state changes — NOT every progress tick
  }, [roomCode, currentSong?.id, isPlaying, suppressBroadcast]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
