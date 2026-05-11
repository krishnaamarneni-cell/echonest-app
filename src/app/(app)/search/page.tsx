'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Album, Artist, Playlist } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { MediaCard } from '@/components/ui/MediaCard';
import { BrowseTile, pickGradient } from '@/components/ui/BrowseTile';
import { usePlayerStore } from '@/store/player';
import { Search as SearchIcon, X, Music, Play } from 'lucide-react';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue, fillPlaylistCovers } from '@/lib/playlistQueue';
import Image from 'next/image';

interface BrowseItem {
  title: string;
  href: string;
  imageUrl: string | null;
  gradient: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [allPlaylistSongs, setAllPlaylistSongs] = useState<Song[]>([]);
  const [songsInPlaylists, setSongsInPlaylists] = useState<Set<string>>(new Set());
  const [browsePlaylists, setBrowsePlaylists] = useState<Playlist[]>([]);
  const [searching, setSearching] = useState(false);

  const play = usePlayerStore((s) => s.play);

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
      return;
    }

    setSearching(true);
    const supabase = createClient();
    const pattern = `%${q}%`;

    const [songsRes, albumsRes, artistsRes, playlistsRes] = await Promise.all([
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
    ]);

    if (songsRes.data) setSongs(songsRes.data);
    if (albumsRes.data) setAlbums(albumsRes.data);
    if (artistsRes.data) setArtists(artistsRes.data);
    if (playlistsRes.data) setPlaylists(playlistsRes.data);
    setSearching(false);
  }, []);

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
    playlists.length > 0;

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
            placeholder="What do you want to listen to?"
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

      {/* Empty state — browse tiles */}
      {!query && (
        <div className="space-y-4">
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
