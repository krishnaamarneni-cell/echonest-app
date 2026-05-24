'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { proxySearch, ytVideoToSong, type YtVideo } from '@/lib/ytSearch';
import { coverFor } from '@/lib/coverFor';
import type { Song, Playlist, Artist } from '@/types';
import {
  Search as SearchIcon,
  X,
  Music,
  Play,
  ListMusic,
  Mic2,
  Loader2,
  ArrowRight,
} from 'lucide-react';

// A search box that pulls results live as the user types — no submit button.
// Shows a YouTube-Music-style autocomplete dropdown with songs, playlists,
// artists and live YouTube results. Click a song to play instantly; press
// Enter or "See all results" to open the full /search page.
export function LiveSearchBox({ className = '' }: { className?: string }) {
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [yt, setYt] = useState<YtVideo[]>([]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSongs([]);
      setPlaylists([]);
      setArtists([]);
      setYt([]);
      setLoading(false);
      return;
    }
    // Cancel any in-flight YouTube lookup so stale results don't overwrite.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    const supabase = createClient();
    const pattern = `%${trimmed}%`;

    try {
      const [songsRes, playlistsRes, artistsRes, ytVideos] = await Promise.all([
        supabase
          .from('songs')
          .select('*')
          .or(`title.ilike.${pattern},artist_name.ilike.${pattern}`)
          .limit(5),
        supabase
          .from('playlists')
          .select('*')
          .or(`title.ilike.${pattern},description.ilike.${pattern}`)
          .limit(4),
        supabase.from('artists').select('*').ilike('name', pattern).limit(4),
        proxySearch(trimmed, ctrl.signal).catch(() => [] as YtVideo[]),
      ]);

      if (ctrl.signal.aborted) return;
      setSongs((songsRes.data as Song[]) || []);
      setPlaylists((playlistsRes.data as Playlist[]) || []);
      setArtists((artistsRes.data as Artist[]) || []);
      setYt(ytVideos.slice(0, 6));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // Debounce: search ~220ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 220);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const goToFullSearch = useCallback(() => {
    const q = query.trim();
    setOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }, [query, router]);

  const playSong = (song: Song) => {
    play(song, [song], 'library');
    setOpen(false);
  };

  const playYt = (v: YtVideo) => {
    const song = ytVideoToSong(v);
    play(song, [song], 'library');
    setOpen(false);
  };

  const hasAny =
    songs.length > 0 || playlists.length > 0 || artists.length > 0 || yt.length > 0;
  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') goToFullSearch();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search songs, albums, artists, playlists"
        className="w-full rounded-full border border-border bg-card py-2.5 pl-11 pr-10 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      />
      {query && (
        <button
          onClick={() => {
            setQuery('');
            setOpen(false);
          }}
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-card-hover hover:text-foreground"
          aria-label="Clear"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Live results dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
          {loading && !hasAny ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : !hasAny ? (
            <button
              onClick={goToFullSearch}
              className="flex w-full items-center gap-2 px-4 py-6 text-left text-sm text-muted-foreground hover:bg-card-hover"
            >
              <SearchIcon className="h-4 w-4" />
              Search for &quot;{query.trim()}&quot;
            </button>
          ) : (
            <div className="py-2">
              {/* Songs */}
              {songs.length > 0 && (
                <Group label="Songs">
                  {songs.map((s) => (
                    <ResultRow
                      key={s.id}
                      image={coverFor(s)}
                      rounded={false}
                      title={s.title}
                      subtitle={s.artist_name}
                      onClick={() => playSong(s)}
                      showPlay
                    />
                  ))}
                </Group>
              )}

              {/* Playlists */}
              {playlists.length > 0 && (
                <Group label="Playlists">
                  {playlists.map((p) => (
                    <ResultRow
                      key={p.id}
                      image={p.cover_url}
                      fallbackIcon={<ListMusic className="h-5 w-5 text-muted" />}
                      title={p.title}
                      subtitle="Playlist"
                      onClick={() => {
                        setOpen(false);
                        router.push(`/playlist/${p.id}`);
                      }}
                    />
                  ))}
                </Group>
              )}

              {/* Artists */}
              {artists.length > 0 && (
                <Group label="Artists">
                  {artists.map((a) => (
                    <ResultRow
                      key={a.id}
                      image={a.image_url}
                      rounded
                      fallbackIcon={<Mic2 className="h-5 w-5 text-muted" />}
                      title={a.name}
                      subtitle="Artist"
                      onClick={() => {
                        setOpen(false);
                        router.push(`/artist/${a.id}`);
                      }}
                    />
                  ))}
                </Group>
              )}

              {/* From YouTube */}
              {yt.length > 0 && (
                <Group label="From YouTube">
                  {yt.map((v) => (
                    <ResultRow
                      key={v.videoId}
                      image={v.thumbnail}
                      rounded={false}
                      title={v.title}
                      subtitle={v.channel}
                      onClick={() => playYt(v)}
                      showPlay
                    />
                  ))}
                </Group>
              )}

              {/* See all */}
              <button
                onClick={goToFullSearch}
                className="mt-1 flex w-full items-center justify-between border-t border-border px-4 py-3 text-left text-sm font-medium text-accent hover:bg-card-hover"
              >
                <span>See all results for &quot;{query.trim()}&quot;</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  image,
  title,
  subtitle,
  onClick,
  rounded = false,
  showPlay = false,
  fallbackIcon,
}: {
  image: string | null | undefined;
  title: string;
  subtitle: string;
  onClick: () => void;
  rounded?: boolean;
  showPlay?: boolean;
  fallbackIcon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-card-hover"
    >
      <div
        className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-background ${
          rounded ? 'rounded-full' : 'rounded-md'
        }`}
      >
        {image ? (
          <Image
            src={image}
            alt={title}
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        ) : (
          fallbackIcon || <Music className="h-5 w-5 text-muted" />
        )}
        {showPlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-4 w-4 fill-current text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
