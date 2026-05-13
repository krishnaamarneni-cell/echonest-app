'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useListenAlong } from '@/store/listenAlong';
import { usePlayerStore } from '@/store/player';
import { Button } from '@/components/ui/Button';
import { Users, LogOut, Loader2 } from 'lucide-react';
import type { Song } from '@/types';

export default function ListenAlongPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const joinRoom = useListenAlong((s) => s.joinRoom);
  const leaveRoom = useListenAlong((s) => s.leaveRoom);
  const peerCount = useListenAlong((s) => s.peerCount);
  const inRoomCode = useListenAlong((s) => s.roomCode);
  const play = usePlayerStore((s) => s.play);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const [hostPosition, setHostPosition] = useState<number>(0);
  const [hostIsPlaying, setHostIsPlaying] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomSong, setRoomSong] = useState<Song | null>(null);
  const [hasJoined, setHasJoined] = useState(false);

  // Look up the room and stash the current song (don't play yet — browsers
  // require a user gesture, so the user has to tap "Join the music").
  useEffect(() => {
    if (!code) return;
    const upper = code.toUpperCase();
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('listening_rooms')
        .select('*')
        .eq('code', upper)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError('Room not found or expired');
        setLoading(false);
        return;
      }
      const song = data.current_song as Song | null;
      if (song) setRoomSong(song);
      // Compute the effective current position from when the host last
      // reported. If they're playing, advance by elapsed time.
      const lastAtMs = new Date(data.last_action_at).getTime();
      const elapsedSec = Math.max(0, (Date.now() - lastAtMs) / 1000);
      const stored = Number(data.position_seconds) || 0;
      setHostPosition(data.is_playing ? stored + elapsedSec : stored);
      setHostIsPlaying(!!data.is_playing);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const acceptAndJoin = () => {
    if (!code) return;
    const upper = code.toUpperCase();
    const player = usePlayerStore.getState();
    const la = useListenAlong.getState();

    // Seed initial playback. We pre-set suppressBroadcast so the listener
    // lock doesn't reject this initial play() — only user-initiated taps
    // are meant to be locked, not the room's own seed.
    if (roomSong) {
      la.setSuppressBroadcast(true);
      try {
        player.play(roomSong, [roomSong], 'library');
      } finally {
        setTimeout(() => la.setSuppressBroadcast(false), 100);
      }
      // Seek once audio is ready (handleLoadedMetadata also reapplies)
      const targetPos = hostPosition;
      setTimeout(() => {
        la.setSuppressBroadcast(true);
        try {
          if (targetPos > 0.5) player.seekTo(targetPos);
          if (!hostIsPlaying) player.pause();
        } finally {
          setTimeout(() => la.setSuppressBroadcast(false), 100);
        }
      }, 400);
    }
    joinRoom(upper);
    setHasJoined(true);
  };

  const handleLeave = () => {
    leaveRoom();
    router.push('/dashboard');
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Joining room…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Can&apos;t join room</h1>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => router.push('/dashboard')} variant="secondary">
          Back to library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in max-w-2xl">
      <div className="bg-gradient-to-br from-accent/30 via-purple-700/20 to-pink-600/20 border border-accent/40 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <Users className="w-4 h-4" />
          Listen-along room
        </div>
        <h1 className="text-3xl font-bold">{code?.toUpperCase()}</h1>
        {!hasJoined ? (
          <p className="text-muted-foreground text-sm">
            Tap below to start listening with the room. Browsers block
            auto-playing audio, so we need one tap from you.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {peerCount > 0
              ? `${peerCount} ${peerCount === 1 ? 'person' : 'people'} listening`
              : 'Connecting to room…'}
            {' · '}Anyone can pick a song. Everyone hears it together.
          </p>
        )}
        {roomSong && (
          <div className="flex items-center gap-3 bg-card/60 rounded-xl p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {roomSong.cover_url && (
              <img
                src={roomSong.cover_url}
                alt=""
                className="w-14 h-14 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Now playing</p>
              <p className="text-sm font-medium truncate">{roomSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {roomSong.artist_name}
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!hasJoined ? (
            <Button onClick={acceptAndJoin}>
              <Users className="w-4 h-4" />
              Join the music
            </Button>
          ) : (
            <>
              <Button onClick={() => router.push('/dashboard')} variant="secondary">
                Browse library
              </Button>
              <Button onClick={handleLeave} variant="danger">
                <LogOut className="w-4 h-4" />
                Leave room
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>How it works:</strong> while you&apos;re in this room, anyone
          who joins (you, friends, anyone with the link) can play / pause /
          skip / pick a song. Everyone hears the same thing.
        </p>
        <p>You&apos;re in room <span className="font-mono text-foreground">{inRoomCode}</span>.</p>
      </div>
    </div>
  );
}
