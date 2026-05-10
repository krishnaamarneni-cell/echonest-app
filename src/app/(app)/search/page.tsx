'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song, Album, Artist, Playlist } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { MediaCard } from '@/components/ui/MediaCard';
import { Search as SearchIcon, X } from 'lucide-react';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue } from '@/lib/playlistQueue';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [allPlaylistSongs, setAllPlaylistSongs] = useState<Song[]>([]);
  const [songsInPlaylists, setSongsInPlaylists] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  // Load all songs from playlists once on mount — for the "from your playlists" suggestion
  // and for marking which results are already in a playlist
  useEffect(() => {
    fetchAllPlaylistsWithSongs().then((data) => {
      const flat = buildCrossPlaylistQueue(data);
      setAllPlaylistSongs(flat);
      setSongsInPlaylists(new Set(flat.map((s) => s.id)));
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

  // Categorize song results: in-playlist vs not in playlist
  const songsInPlaylistResults = songs.filter((s) => songsInPlaylists.has(s.id));
  const songsNotInPlaylistResults = songs.filter((s) => !songsInPlaylists.has(s.id));

  const hasResults =
    songs.length > 0 ||
    albums.length > 0 ||
    artists.length > 0 ||
    playlists.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">Search</h1>

      <div className="relative max-w-xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, albums, artists, playlists..."
          className="w-full pl-12 pr-10 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {!query && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchIcon className="w-16 h-16 text-muted mb-4" />
          <h2 className="text-xl font-semibold mb-1">Search your library</h2>
          <p className="text-sm text-muted-foreground">
            Find songs, albums, artists, and playlists
          </p>
        </div>
      )}

      {query && !searching && !hasResults && (
        <div className="space-y-6">
          <div className="text-center py-8 bg-card border border-border rounded-2xl">
            <p className="text-base font-semibold mb-1">No matches in your library</p>
            <p className="text-sm text-muted-foreground">
              Nothing found for &quot;{query}&quot;.
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

      {/* Songs that ARE in a playlist */}
      {songsInPlaylistResults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Songs in your playlists</h2>
          <div className="space-y-0.5">
            {songsInPlaylistResults.map((song) => (
              <SongRow key={song.id} song={song} songs={songs} />
            ))}
          </div>
        </section>
      )}

      {/* Songs in your library but NOT in any playlist */}
      {songsNotInPlaylistResults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {songsInPlaylistResults.length > 0 ? 'Other songs in your library' : 'Songs in your library'}
          </h2>
          {songsInPlaylistResults.length === 0 && (
            <p className="text-xs text-muted-foreground mb-2">
              Tip: tap the ⋯ menu on any song to add it to a playlist.
            </p>
          )}
          <div className="space-y-0.5">
            {songsNotInPlaylistResults.map((song) => (
              <SongRow key={song.id} song={song} songs={songs} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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

      {artists.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Artists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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

      {playlists.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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
    </div>
  );
}
