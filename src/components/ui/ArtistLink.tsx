'use client';

/**
 * The artist name under the player, made tappable.
 *
 * A song credited to several artists has no single destination, so the tap
 * opens a picker instead of choosing for the user — see ArtistPicker, and
 * artistCredit.ts for why "Divo Music and 3 more" is four artists and not
 * one oddly-named label.
 *
 * For a single artist the tap goes straight through, and where it goes
 * depends on what the song actually knows, which splits three ways:
 *
 *  - A library song has artist_id, so /artist/<id> is already right.
 *  - A YouTube song knows only the channel's *title*. There is no id or
 *    handle on the row, so the channel has to be resolved from the video
 *    (see /api/youtube/channel) before there is anywhere to go.
 *  - Anything else falls back to searching the Artists page by name, which
 *    is also where a failed lookup lands. Better to hand over a search
 *    than to open a confidently wrong channel.
 *
 * The resolve is deliberately done on tap rather than on render: most
 * songs played are never tapped through, and resolving every one of them
 * would spend YouTube quota on a question nobody asked.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { isMultiArtist, parseArtistCredit } from '@/lib/artistCredit';
import { ArtistPicker } from './ArtistPicker';

interface ChannelInfo {
  handle: string;
  title: string;
}

export function ArtistLink({
  song,
  className = '',
}: {
  song: Song;
  className?: string;
}) {
  const router = useRouter();
  const closeNowPlaying = usePlayerStore((s) => s.closeNowPlaying);
  const [resolving, setResolving] = useState(false);
  const [picking, setPicking] = useState(false);

  const name = song.artist_name || 'Unknown artist';
  const multi = isMultiArtist(parseArtistCredit(song.artist_name));

  const go = async () => {
    if (resolving) return;

    if (multi) {
      setPicking(true);
      return;
    }

    // The sheet is a full-screen overlay; leaving it up would hide the page
    // we just navigated to.
    const leave = (href: string) => {
      closeNowPlaying();
      router.push(href);
    };

    if (song.artist_id) {
      leave(`/artist/${song.artist_id}`);
      return;
    }

    const search = `/artists?q=${encodeURIComponent(name)}`;

    if (!song.youtube_id) {
      leave(search);
      return;
    }

    setResolving(true);
    try {
      const r = await fetch(`/api/youtube/channel?video=${encodeURIComponent(song.youtube_id)}`);
      const body = (await r.json().catch(() => null)) as { channel?: ChannelInfo } | null;
      const handle = body?.channel?.handle;
      // Not every channel has claimed a handle, and the artist page is
      // addressed by one — without it, the search is the honest answer.
      leave(handle ? `/artists/${encodeURIComponent(handle)}` : search);
    } catch {
      leave(search);
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <button
        onClick={go}
        title={multi ? 'See everyone credited on this song' : `Top songs from ${name}`}
        className={`group flex items-center gap-1 text-left transition-colors hover:text-foreground ${className}`}
      >
        <span className="truncate">{name}</span>
        {resolving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
        )}
      </button>

      {picking && <ArtistPicker song={song} onClose={() => setPicking(false)} />}
    </>
  );
}
