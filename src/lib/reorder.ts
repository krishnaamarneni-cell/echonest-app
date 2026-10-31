'use client';

/**
 * Persisting a drag-reordered playlist or Liked Songs list.
 *
 * The drag itself is @dnd-kit's (see SortableSongList); this is only the
 * write that makes the new order stick.
 *
 * Both tables carry an integer `position`, but neither can be trusted to
 * be normalised: playlist_songs.position defaults to 0, so a playlist
 * built by any of the import paths has every row sitting at 0 and an
 * effectively arbitrary order. Swapping two values would do nothing at
 * all there.
 *
 * So a move always rewrites the whole list as 0..n-1. It costs one round
 * trip either way, and it leaves the table normalised afterwards, which
 * means the next move is operating on real numbers rather than a pile of
 * zeroes.
 */

import { createClient } from '@/lib/supabase/client';

/**
 * Write `ids` back as positions 0..n-1.
 *
 * upsert rather than n updates: one request instead of one per row. The
 * extra columns are not decoration — upsert is an INSERT that falls back
 * to UPDATE, so every NOT NULL column has to be present or Postgres
 * rejects the row before it ever gets to the conflict clause.
 */
async function persistOrder(
  table: 'playlist_songs' | 'likes',
  rows: Record<string, unknown>[],
): Promise<boolean> {
  if (rows.length === 0) return true;
  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .upsert(rows.map((r, i) => ({ ...r, position: i })), { onConflict: 'id' });
  return !error;
}

export interface PlaylistSongRow {
  id: string;
  playlist_id: string;
  song_id: string;
}

export function persistPlaylistOrder(rows: PlaylistSongRow[]): Promise<boolean> {
  return persistOrder(
    'playlist_songs',
    rows.map((r) => ({ id: r.id, playlist_id: r.playlist_id, song_id: r.song_id })),
  );
}

export interface LikeRow {
  id: string;
  user_id: string;
  song_id: string;
}

export function persistLikedOrder(rows: LikeRow[]): Promise<boolean> {
  return persistOrder(
    'likes',
    rows.map((r) => ({ id: r.id, user_id: r.user_id, song_id: r.song_id })),
  );
}
