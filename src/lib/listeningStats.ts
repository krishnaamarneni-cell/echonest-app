/**
 * Listening-pattern aggregation over the recently_played log.
 *
 * Every play writes a row to recently_played (user_id, song_id, played_at),
 * so play counts are just a group-by. Both "On Repeat" and "For You" read
 * from here so they always agree about what the user actually listens to.
 *
 * Deliberately client-side: recently_played is RLS-scoped to the caller, so
 * one query returns only this user's rows and needs no server endpoint.
 */

import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';

export interface PlayEvent {
  played_at: string;
  song: Song | null;
}

export interface SongPlayCount {
  song: Song;
  count: number;
  lastPlayed: string;
}

/**
 * Pull play history, newest first. 5000 rows covers years of personal
 * listening in a single fast request — the same budget the Stats page uses.
 */
export async function fetchPlayHistory(limit = 5000): Promise<PlayEvent[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('recently_played')
    .select('played_at, song:songs(*)')
    .order('played_at', { ascending: false })
    .limit(limit);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    played_at: r.played_at as string,
    song: (r.song as Song) ?? null,
  }));
}

/** Keep only plays from the last `days` days. days = 0 means all time. */
export function withinDays(plays: PlayEvent[], days: number): PlayEvent[] {
  if (!days) return plays;
  const cutoff = Date.now() - days * 86_400_000;
  return plays.filter((p) => new Date(p.played_at).getTime() >= cutoff);
}

/**
 * Songs ranked by play count, most-played first. `minPlays` is what makes
 * this "on repeat" rather than "recently played" — a song you played once
 * isn't on repeat, so the default of 2 is the lowest bar that still means
 * "came back to it". Ties break toward the more recently played song.
 */
export function rankSongsByPlays(plays: PlayEvent[], minPlays = 2): SongPlayCount[] {
  const counts = new Map<string, SongPlayCount>();
  for (const ev of plays) {
    if (!ev.song) continue;
    const found = counts.get(ev.song.id);
    if (found) {
      found.count += 1;
    } else {
      counts.set(ev.song.id, { song: ev.song, count: 1, lastPlayed: ev.played_at });
    }
  }
  return Array.from(counts.values())
    .filter((c) => c.count >= minPlays)
    .sort((a, b) => b.count - a.count || (a.lastPlayed < b.lastPlayed ? 1 : -1));
}

/** Every videoId the user has already heard — used to filter suggestions. */
export function heardVideoIds(plays: PlayEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const ev of plays) {
    if (ev.song?.youtube_id) ids.add(ev.song.youtube_id);
  }
  return ids;
}
