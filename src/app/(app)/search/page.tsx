'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Song, Album, Artist, Playlist } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { MediaCard } from '@/components/ui/MediaCard';
import { BrowseTile, pickGradient } from '@/components/ui/BrowseTile';
import { usePlayerStore } from '@/store/player';
import { Search as SearchIcon, X, Music, Play, TrendingUp, Loader2 } from 'lucide-react';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue, fillPlaylistCovers } from '@/lib/playlistQueue';
import Image from 'next/image';

interface TrendingItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

interface BrowseItem {
  title: string;
  href: string;
  imageUrl: string | null;
  gradient: string;
}

// Next.js requires components that read useSearchParams to be inside a
// Suspense boundary so the rest of the page can still be prerendered.
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  // Accept an initial query from /search?q=... so dashboard search redirects
  // and shareable search URLs both work.
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get('q') || '';
  const [query, setQuery] = useState(initialQ);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [allPlaylistSongs, setAllPlaylistSongs] = useState<Song[]>([]);
  const [songsInPlaylists, setSongsInPlaylists] = useState<Set<string>>(new Set());
  const [browsePlaylists, setBrowsePlaylists] = useState<Playlist[]>([]);
  const [searching, setSearching] = useState(false);
  const [ytResults, setYtResults] = useState<
    { videoId: string; title: string; channel: string; thumbnail: string }[]
  >([]);
  const [ytError, setYtError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [trendingExpanded, setTrendingExpanded] = useState(false);

  const play = usePlayerStore((s) => s.play);

  // Pull "Trending → Music" from YouTube once on mount. Cached server-side
  // for 1 hour, so this is essentially free on subsequent visits.
  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    fetch('/api/youtube-trending?max=50')
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && Array.isArray(body?.items)) {
          setTrending(body.items);
          setTrendingError(null);
        } else {
          setTrendingError(body?.error || `Couldn't load trending (${r.status})`);
        }
      })
      .catch((e) => {
        if (!cancelled) setTrendingError(String(e));
      })
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load playlist data + the user's playlists for the browse tiles
  useEffect(() => {
    fetchAllPlaylistsWithSongs().then((data) => {
      const flat = buildCrossPlaylistQueue(data);
      setAllPlaylistSongs(flat);
      setSongsInPlaylists(new Set(flat.map((s) => s.id)));
    });

    const supabase = createClient();
    supabase
      .from('playlists')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(12)
      .then(async ({ data }) => {
        if (data) setBrowsePlaylists(await fillPlaylistCovers(data));
      });
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSongs([]);
      setAlbums([]);
      setArtists([]);
      setPlaylists([]);
      setYtResults([]);
      return;
    }

    setSearching(true);
    const supabase = createClient();
    const pattern = `%${q}%`;

    const [songsRes, albumsRes, artistsRes, playlistsRes, ytRes] = await Promise.all([
      supabase
        .from('songs')
        .select('*')
        .or(`title.ilike.${pattern},artist_name.ilike.${pattern}`)
        .limit(20),
      supabase
        .from('albums')
        .select('*')
        .or(`title.ilike.${pattern},artist_name.ilike.${pattern}`)
        .limit(6),
      supabase.from('artists').select('*').ilike('name', pattern).limit(6),
      supabase.from('playlists').select('*').ilike('title', pattern).limit(6),
      fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          return { ok: r.ok, status: r.status, body };
        })
        .catch((e) => ({ ok: false, status: 0, body: { error: String(e) } })),
    ]);

    if (songsRes.data) setSongs(songsRes.data);
    if (albumsRes.data) setAlbums(albumsRes.data);
    if (artistsRes.data) setArtists(artistsRes.data);
    if (playlistsRes.data) setPlaylists(playlistsRes.data);
    if (ytRes.ok && Array.isArray(ytRes.body?.videos)) {
      setYtResults(ytRes.body.videos);
      setYtError(null);
    } else {
      setYtResults([]);
      setYtError(
        ytRes.body?.error ||
          (ytRes.status === 503
            ? 'YOUTUBE_API_KEY not set on the server'
            : `YouTube search unavailable (${ytRes.status || 'network'})`),
      );
    }
    setSearching(false);
  }, []);

  // Add a YouTube search result to the library and play it
  const playYoutubeResult = useCallback(
    async (vid: { videoId: string; title: string; channel: string; thumbnail: string }) => {
      setAddingId(vid.videoId);
      try {
        // 1. Check if it's already in the library (by youtube_id)
        const supabase = createClient();
        const { data: existing } = await supabase
          .from('songs')
          .select('*')
          .eq('youtube_id', vid.videoId)
          .eq('source', 'youtube_embed')
          .limit(1)
          .maybeSingle();
        if (existing) {
          play(existing as Song, [existing as Song], 'library');
          return;
        }
        // 2. Otherwise, add it via the same endpoint that the Upload page uses
        const res = await fetch('/api/youtube-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${vid.videoId}`,
            contentType: 'music',
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.song) {
          play(data.song as Song, [data.song as Song], 'library');
        }
      } finally {
        setAddingId(null);
      }
    },
    [play],
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Browse tiles for the empty state — special tiles first, then user playlists
  const browseItems = useMemo<BrowseItem[]>(() => {
    const tiles: BrowseItem[] = [
      {
        title: 'Liked Songs',
        href: '/liked',
        imageUrl: null,
        gradient: 'bg-gradient-to-br from-purple-700 to-pink-600',
      },
      {
        title: 'Recently Played',
        href: '/recent',
        imageUrl: null,
        gradient: 'bg-gradient-to-br from-blue-700 to-cyan-600',
      },
      {
        title: 'From YouTube',
        href: '/import',
        imageUrl: null,
        gradient: 'bg-gradient-to-br from-red-700 to-rose-600',
      },
      {
        title: 'Your Library',
        href: '/library',
        imageUrl: null,
        gradient: 'bg-gradient-to-br from-amber-700 to-orange-600',
      },
    ];

    for (const p of browsePlaylists) {
      tiles.push({
        title: p.title,
        href: `/playlist/${p.id}`,
        imageUrl: p.cover_url,
        gradient: pickGradient(p.id),
      });
    }

    return tiles;
  }, [browsePlaylists]);

  // Top result for search results — pick the highest-quality match
  const topResult: Song | Playlist | Album | Artist | null = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    // Prefer an exact title match in songs, then playlists, then albums, then artists
    const exactSong = songs.find((s) => s.title.toLowerCase() === q);
    if (exactSong) return exactSong;
    const exactPlaylist = playlists.find((p) => p.title.toLowerCase() === q);
    if (exactPlaylist) return exactPlaylist;
    // Fallbacks
    if (songs[0]) return songs[0];
    if (playlists[0]) return playlists[0];
    if (albums[0]) return albums[0];
    if (artists[0]) return artists[0];
    return null;
  }, [query, songs, albums, artists, playlists]);

  const isTopSong = topResult && 'duration' in topResult;
  const isTopPlaylist = topResult && 'title' in topResult && !('duration' in topResult) && 'description' in topResult;
  const isTopAlbum = topResult && 'artist_name' in topResult && 'year' in topResult;
  const isTopArtist = topResult && 'name' in topResult;

  const songsInPlaylistResults = songs.filter((s) => songsInPlaylists.has(s.id));
  const songsNotInPlaylistResults = songs.filter((s) => !songsInPlaylists.has(s.id));

  const hasResults =
    songs.length > 0 ||
    albums.length > 0 ||
    artists.length > 0 ||
    playlists.length > 0 ||
    ytResults.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Search input */}
      <div className="sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 bg-background/95 backdrop-blur-md">
        <div className="relative max-w-xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, albums, artists, playlists"
            autoFocus
            className="w-full pl-12 pr-10 py-3 rounded-full bg-card border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Empty state — trending then browse tiles */}
      {!query && (
        <div className="space-y-8">
          {/* Trending on YouTube — YouTube-Music-style 3-column ranked list */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent" />
                <h2 className="text-2xl font-bold">Trending</h2>
              </div>
              {trending.length > 12 && !trendingLoading && !trendingError && (
                <button
                  onClick={() => setTrendingExpanded((v) => !v)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-card-hover hover:bg-card border border-border text-foreground transition-colors"
                >
                  {trendingExpanded ? 'Show less' : `Show all ${trending.length}`}
                </button>
              )}
            </div>
            {trendingLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse bg-card rounded-lg"
                  />
                ))}
              </div>
            ) : trendingError ? (
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load trending — {trendingError}
              </p>
            ) : trending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trending data right now.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
                {(trendingExpanded ? trending : trending.slice(0, 12)).map((v, idx) => (
                  <button
                    key={v.videoId}
                    onClick={() =>
                      playYoutubeResult({
                        videoId: v.videoId,
                        title: v.title,
                        channel: v.channel,
                        thumbnail: v.thumbnail,
                      })
                    }
                    disabled={addingId === v.videoId}
                    className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-card-hover text-left transition-colors disabled:opacity-60"
                  >
                    <div className="relative w-10 h-10 rounded-md overflow-hidden bg-card flex-shrink-0">
                      <Image
                        src={v.thumbnail}
                        alt={v.title}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        {addingId === v.videoId ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 text-white fill-current" />
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums w-6 text-right flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.channel} · {compactNumber(v.viewCount)} views
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold">Browse your music</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {browseItems.map((item) => (
                <BrowseTile
                  key={item.href}
                  title={item.title}
                  href={item.href}
                  imageUrl={item.imageUrl}
                  gradient={item.gradient}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* No matches state */}
      {query && !searching && !hasResults && (
        <div className="space-y-6">
          <div className="text-center py-12 bg-card border border-border rounded-2xl">
            <SearchIcon className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-base font-semibold mb-1">No results for &quot;{query}&quot;</p>
            <p className="text-sm text-muted-foreground">
              Try different keywords, or browse below.
            </p>
          </div>
          {allPlaylistSongs.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">From your playlists</h2>
              <div className="space-y-0.5">
                {allPlaylistSongs.slice(0, 8).map((song) => (
                  <SongRow key={song.id} song={song} songs={allPlaylistSongs} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Top result + Songs (Spotify-style two-column on desktop) */}
      {query && hasResults && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Top result card */}
          {topResult && (
            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold mb-3">Top result</h2>
              <TopResultCard
                result={topResult}
                isSong={!!isTopSong}
                isPlaylist={!!isTopPlaylist}
                isAlbum={!!isTopAlbum && !isTopPlaylist && !isTopSong}
                isArtist={!!isTopArtist && !isTopAlbum && !isTopPlaylist && !isTopSong}
                onPlaySong={(s) => play(s, [s], 'library')}
              />
            </div>
          )}

          {/* Songs */}
          {songs.length > 0 && (
            <div className="lg:col-span-3">
              <h2 className="text-lg font-semibold mb-3">Songs</h2>
              <div className="space-y-0.5">
                {songs.slice(0, 6).map((song) => (
                  <SongRow key={song.id} song={song} songs={songs} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* YouTube search error chip */}
      {query && ytError && ytResults.length === 0 && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          From YouTube: {ytError}
        </div>
      )}

      {/* From YouTube — tap to add + play */}
      {query && ytResults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">From YouTube</h2>
          <div className="space-y-0.5">
            {ytResults.map((v) => (
              <button
                key={v.videoId}
                type="button"
                onClick={() => playYoutubeResult(v)}
                disabled={addingId === v.videoId}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-card-hover transition-colors text-left disabled:opacity-60"
              >
                <div className="w-12 h-12 rounded-md bg-background overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {v.channel}
                  </p>
                </div>
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/90 flex items-center justify-center text-white">
                  {addingId === v.videoId ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Playlists */}
      {query && playlists.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {playlists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.title}
                subtitle="Playlist"
                imageUrl={playlist.cover_url}
                href={`/playlist/${playlist.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Albums */}
      {query && albums.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.title}
                subtitle={album.artist_name}
                imageUrl={album.cover_url}
                href={`/album/${album.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Artists */}
      {query && artists.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Artists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {artists.map((artist) => (
              <MediaCard
                key={artist.id}
                title={artist.name}
                subtitle="Artist"
                imageUrl={artist.image_url}
                href={`/artist/${artist.id}`}
                rounded
              />
            ))}
          </div>
        </section>
      )}

      {/* All matching songs (after Top Result section) — only when we have songs that didn't fit */}
      {query && songs.length > 6 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">More songs</h2>
          <div className="space-y-0.5">
            {songs.slice(6).map((song) => (
              <SongRow key={song.id} song={song} songs={songs} />
            ))}
          </div>
        </section>
      )}

      {/* Hint about adding library-only songs to a playlist */}
      {query && songsInPlaylistResults.length === 0 && songsNotInPlaylistResults.length > 0 && (
        <p className="text-xs text-muted-foreground italic">
          Tip: tap the ⋯ menu on any song to add it to a playlist.
        </p>
      )}
    </div>
  );
}

function TopResultCard({
  result,
  isSong,
  isPlaylist,
  isAlbum,
  isArtist,
  onPlaySong,
}: {
  result: Song | Playlist | Album | Artist;
  isSong: boolean;
  isPlaylist: boolean;
  isAlbum: boolean;
  isArtist: boolean;
  onPlaySong: (song: Song) => void;
}) {
  const r = result as Song & Playlist & Album & Artist;
  const title = isArtist ? r.name : r.title;
  const subtitle = isSong
    ? r.artist_name
    : isAlbum
    ? r.artist_name
    : isPlaylist
    ? 'Playlist'
    : isArtist
    ? 'Artist'
    : '';

  const imageUrl = isSong
    ? r.cover_url
    : isAlbum
    ? r.cover_url
    : isPlaylist
    ? r.cover_url
    : isArtist
    ? r.image_url
    : null;

  const href = isSong
    ? null
    : isPlaylist
    ? `/playlist/${r.id}`
    : isAlbum
    ? `/album/${r.id}`
    : isArtist
    ? `/artist/${r.id}`
    : null;

  const card = (
    <div className="group bg-card hover:bg-card-hover transition-colors rounded-2xl p-5 h-full relative overflow-hidden">
      <div className="w-24 h-24 rounded-lg bg-background overflow-hidden shadow-lg mb-4">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            width={96}
            height={96}
            className={`w-full h-full object-cover ${isArtist ? 'rounded-full' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-10 h-10 text-muted" />
          </div>
        )}
      </div>
      <h3 className="text-xl sm:text-2xl font-bold truncate">{title}</h3>
      <p className="text-sm text-muted-foreground truncate mt-1">{subtitle}</p>
      {isSong && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPlaySong(r);
          }}
          className="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:bg-accent-hover hover:scale-105 active:scale-95"
        >
          <Play className="w-5 h-5 fill-current ml-0.5" />
        </button>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block h-full">
        {card}
      </a>
    );
  }
  return card;
}
