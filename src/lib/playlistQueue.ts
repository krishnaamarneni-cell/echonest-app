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
    const r = row as unknown as { playlist_id: string; song: Song | null };
    if (!r.song) continue;
    const arr = byPlaylist.get(r.playlist_id) || [];
    arr.push(r.song);
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
