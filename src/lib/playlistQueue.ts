import { Song, Playlist } from '@/types';
import { createClient } from './supabase/client';

interface PlaylistWithSongs {
  playlist: Playlist;
  songs: Song[];
}

/**
 * Fetch all of the user's playlists in order (newest updated first), each with
 * their songs in playlist position order.
 */
export async function fetchAllPlaylistsWithSongs(): Promise<PlaylistWithSongs[]> {
  const supabase = createClient();

  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .order('updated_at', { ascending: false });

  if (!playlists?.length) return [];

  const { data: rows } = await supabase
    .from('playlist_songs')
    .select('playlist_id, position, song:songs(*)')
    .in('playlist_id', playlists.map((p) => p.id))
    .order('position');

  const byPlaylist = new Map<string, Song[]>();
  for (const row of rows || []) {
    // Supabase can return the joined `song` as either a single object or a one-element array
    // depending on how it infers the relationship — handle both
    const r = row as unknown as {
      playlist_id: string;
      song: Song | Song[] | null;
    };
    const song = Array.isArray(r.song) ? r.song[0] : r.song;
    if (!song) continue;
    const arr = byPlaylist.get(r.playlist_id) || [];
    arr.push(song);
    byPlaylist.set(r.playlist_id, arr);
  }

  return playlists.map((p: Playlist) => ({
    playlist: p,
    songs: byPlaylist.get(p.id) || [],
  }));
}

/**
 * Flatten all-playlists into a single song queue. Optional: start from a given
 * playlist id, so songs from that playlist play first, then subsequent playlists.
 * Songs already in earlier playlists are de-duplicated within the result.
 */
export function buildCrossPlaylistQueue(
  playlistsWithSongs: PlaylistWithSongs[],
  startPlaylistId?: string,
): Song[] {
  let ordered = playlistsWithSongs;

  if (startPlaylistId) {
    const idx = playlistsWithSongs.findIndex((p) => p.playlist.id === startPlaylistId);
    if (idx > 0) {
      // Put the chosen playlist first, then subsequent ones, then earlier ones
      ordered = [
        ...playlistsWithSongs.slice(idx),
        ...playlistsWithSongs.slice(0, idx),
      ];
    }
  }

  const seen = new Set<string>();
  const result: Song[] = [];
  for (const { songs } of ordered) {
    for (const song of songs) {
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      result.push(song);
    }
  }
  return result;
}

/**
 * Given a list of playlists, fill in missing cover_url values with the
 * cover of the first song in each playlist. One query covers everything.
 * Used to auto-image playlists on Library / Home / Sidebar without
 * requiring the user to manually set a cover.
 */
export async function fillPlaylistCovers(playlists: Playlist[]): Promise<Playlist[]> {
  const missing = playlists.filter((p) => !p.cover_url).map((p) => p.id);
  if (missing.length === 0) return playlists;

  const supabase = createClient();
  const { data: rows } = await supabase
    .from('playlist_songs')
    .select('playlist_id, position, song:songs(cover_url)')
    .in('playlist_id', missing)
    .order('position');

  const firstCover = new Map<string, string>();
  for (const r of rows || []) {
    const row = r as unknown as {
      playlist_id: string;
      song: { cover_url?: string | null } | { cover_url?: string | null }[] | null;
    };
    if (firstCover.has(row.playlist_id)) continue;
    const song = Array.isArray(row.song) ? row.song[0] : row.song;
    const url = song?.cover_url;
    if (url) firstCover.set(row.playlist_id, url);
  }

  return playlists.map((p) =>
    p.cover_url ? p : { ...p, cover_url: firstCover.get(p.id) || null },
  );
}
