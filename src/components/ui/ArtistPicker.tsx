'use client';

/**
 * Which of them did you mean?
 *
 * A song credited to several artists has several right answers, so tapping
 * the artist line opens this instead of guessing. It shows every name the
 * credit contains; when the credit was truncated ("… and 3 more") it asks
 * the proxy for the rest while it is open.
 *
 * The lookup is allowed to come back empty — the proxy runs on a laptop
 * that is often off, and a plain upload carries no music credits at all.
 * In that case the sheet says so rather than pretending the names are
 * coming, and still offers the channel that published the video.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Radio, Search, User, X } from 'lucide-react';
import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import { mergeNames, parseArtistCredit } from '@/lib/artistCredit';
import { proxyCredits } from '@/lib/ytSearch';

interface ChannelInfo {
  handle: string;
  title: string;
}

export function ArtistPicker({ song, onClose }: { song: Song; onClose: () => void }) {
  const router = useRouter();
  const closeNowPlaying = usePlayerStore((s) => s.closeNowPlaying);

  const credit = parseArtistCredit(song.artist_name);
  // Only a YouTube song can be looked up; anything else is already as
  // complete as it is going to get, so the sheet starts settled.
  const canLookUp = credit.hiddenCount > 0 && !!song.youtube_id;

  const [names, setNames] = useState<string[]>(credit.names);
  const [looking, setLooking] = useState(canLookUp);
  const [lookedUp, setLookedUp] = useState(!canLookUp);
  const [openingChannel, setOpeningChannel] = useState(false);

  const missing = Math.max(0, credit.hiddenCount - (names.length - credit.names.length));

  // Leaving for a page means dropping the full-screen Now Playing sheet
  // too, or it would sit on top of whatever we navigated to.
  const leave = useCallback(
    (href: string) => {
      onClose();
      closeNowPlaying();
      router.push(href);
    },
    [onClose, closeNowPlaying, router],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fill in the names the credit line only counted.
  useEffect(() => {
    if (!canLookUp || !song.youtube_id) return;
    const controller = new AbortController();
    proxyCredits(song.youtube_id, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        if (found.length) setNames((prev) => mergeNames(prev, found));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLooking(false);
        setLookedUp(true);
      });
    return () => controller.abort();
    // The song cannot change while the sheet is open — it is mounted per tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChannel = async () => {
    if (openingChannel || !song.youtube_id) return;
    const search = `/artists?q=${encodeURIComponent(credit.names[0] || song.artist_name || '')}`;
    setOpeningChannel(true);
    try {
      const r = await fetch(`/api/youtube/channel?video=${encodeURIComponent(song.youtube_id)}`);
      const body = (await r.json().catch(() => null)) as { channel?: ChannelInfo } | null;
      const handle = body?.channel?.handle;
      leave(handle ? `/artists/${encodeURIComponent(handle)}` : search);
    } catch {
      leave(search);
    } finally {
      setOpeningChannel(false);
    }
  };

  const fullLine = (song.artist_name || '').trim();
  const showFullLineRow = names.length > 1 && fullLine && fullLine !== names[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />

      <div className="relative w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Artists on this song</h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{song.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-full hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-2">
          {names.map((name) => (
            <button
              key={name}
              onClick={() => leave(`/artists?q=${encodeURIComponent(name)}`)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {looking && (
            <div className="flex items-center gap-3 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking up the other {credit.hiddenCount}…
            </div>
          )}

          {/* Said plainly: the names exist, we just could not get them. */}
          {lookedUp && missing > 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              YouTube credits {missing} more {missing === 1 ? 'artist' : 'artists'} on this track but
              did not name {missing === 1 ? 'that one' : 'them'} here. The music proxy has to be
              running to look them up.
            </p>
          )}

          {(showFullLineRow || song.youtube_id) && <div className="my-1 border-t border-border" />}

          {/* A credit like "Earth, Wind & Fire" splits into three names that
              are not artists. Searching the line as written rescues that. */}
          {showFullLineRow && (
            <button
              onClick={() => leave(`/artists?q=${encodeURIComponent(fullLine)}`)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
                <Search className="h-4 w-4 text-muted-foreground" />
              </span>
              <span className="flex-1 min-w-0 truncate text-sm">Search “{fullLine}”</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}

          {song.youtube_id && (
            <button
              onClick={openChannel}
              disabled={openingChannel}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left disabled:opacity-60"
            >
              <span className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
                <Radio className="h-4 w-4 text-muted-foreground" />
              </span>
              <span className="flex-1 min-w-0 truncate text-sm">Channel that published this</span>
              {openingChannel ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
