'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { useCrossDeviceSync } from '@/store/crossDeviceSync';
import type { Song } from '@/types';

// Cross-device player sync (opt-in). Each device writes the current track +
// position to playback_state; on open / tab-focus a device restores the most
// recent snapshot from ANOTHER device. So pausing at 1:12 on a phone and then
// opening the laptop shows the same song at 1:12 (paused — tap to continue).
function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('echonest-device-id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('echonest-device-id', id);
  }
  return id;
}

export function PlaybackSync() {
  const enabled = useCrossDeviceSync((s) => s.enabled);
  const hydrate = useCrossDeviceSync((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  const currentSongId = usePlayerStore((s) => s.currentSong?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const deviceIdRef = useRef('');
  const suppressRef = useRef(false);
  const lastSavedAtRef = useRef(0);

  useEffect(() => { deviceIdRef.current = getDeviceId(); }, []);

  // Restore the latest snapshot from another device on mount + on focus.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const restore = async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data } = await sb
          .from('playback_state')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled || !data || !data.song) return;
        if (data.device_id === deviceIdRef.current) return; // our own snapshot
        // Only catch up if the snapshot is newer than our last local save —
        // i.e. another device changed things after us. Avoids hijacking
        // playback that's actively happening on THIS device.
        const updatedAt = new Date(data.updated_at as string).getTime();
        if (updatedAt <= lastSavedAtRef.current) return;

        const song = data.song as Song;
        const player = usePlayerStore.getState();
        if (player.currentSong && player.currentSong.id === song.id) return;

        suppressRef.current = true;
        try {
          player.play(song, [song], 'library');
          player.pause(); // restore paused — user taps to continue
          const pos = Number(data.position) || 0;
          if (pos > 0) setTimeout(() => usePlayerStore.getState().seekTo(pos), 500);
        } finally {
          setTimeout(() => { suppressRef.current = false; }, 900);
        }
      } catch {}
    };

    restore();
    const onVisible = () => {
      if (document.visibilityState === 'visible') restore();
    };
    window.addEventListener('focus', restore);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', restore);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Save this device's state on song/play changes + periodically while playing.
  useEffect(() => {
    if (!enabled || suppressRef.current || !currentSongId) return;

    const save = async () => {
      if (suppressRef.current) return;
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const player = usePlayerStore.getState();
        if (!player.currentSong) return;
        await sb.from('playback_state').upsert(
          {
            user_id: user.id,
            song: player.currentSong,
            position: player.progress,
            is_playing: player.isPlaying,
            device_id: deviceIdRef.current,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
        lastSavedAtRef.current = Date.now();
      } catch {}
    };

    const debounce = setTimeout(save, 700);
    const interval = isPlaying ? setInterval(save, 10000) : null;
    return () => {
      clearTimeout(debounce);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentSongId, isPlaying]);

  return null;
}
