'use client';

/**
 * Carrying out a parsed voice command.
 *
 * This is the half that touches real data: your playlists, your likes, a
 * YouTube search, and the player store. The parsing half (voiceIntent.ts)
 * knows nothing about any of it, which is what lets the same command type
 * be produced by a regex or by a model without this file caring which.
 *
 * Note what is NOT here: no new playback mechanism. Every action ends in a
 * `play(song, queue, source)` call that the app already made from a tapped
 * row. The assistant is a different way to reach the existing player, not a
 * second player.
 */

import { Song } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/store/player';
import { fetchAllPlaylistsWithSongs, buildCrossPlaylistQueue } from '@/lib/playlistQueue';
import { ytVideoToSong, isCompilation, YtVideo } from '@/lib/ytSearch';
import { VoiceAction, VoiceContext, VoicePlaylist } from '@/lib/voiceIntent';

type PlaylistWithSongs = Awaited<ReturnType<typeof fetchAllPlaylistsWithSongs>>[number];

interface Library {
  playlists: PlaylistWithSongs[];
  liked: Song[];
  at: number;
}

let libraryCache: Library | null = null;
const LIBRARY_TTL = 60_000;

/**
 * Your liked songs, in the order the Liked Songs page shows them.
 *
 * The `position` column only exists after the reorder migration, and asking
 * PostgREST to order by a column it does not know is a 400 for the WHOLE
 * query rather than an ignored clause — so the error is checked and the
 * pre-migration ordering used instead. Swallowing it here would make the
 * assistant announce you have no liked songs.
 */
async function fetchLikedSongs(): Promise<Song[]> {
  const supabase = createClient();
  const COLUMNS = 'song:songs(*)';

  const ordered = await supabase
    .from('likes')
    .select(COLUMNS)
    .order('position', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  let data = ordered.data;
  if (ordered.error) {
    const fallback = await supabase
      .from('likes')
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    data = fallback.data;
  }

  return (data || [])
    .map((d: Record<string, unknown>) => d.song as Song | Song[] | null)
    .map((s) => (Array.isArray(s) ? s[0] : s))
    .filter((s): s is Song => !!s);
}

/**
 * Load playlists and likes once and reuse them for a minute.
 *
 * A command is two reads of the same thing — the parser needs the playlist
 * names to match against, then the executor needs that playlist's songs to
 * play. Fetching twice would double the latency of every single command.
 */
export async function loadVoiceLibrary(force = false): Promise<Library> {
  if (!force && libraryCache && Date.now() - libraryCache.at < LIBRARY_TTL) {
    return libraryCache;
  }
  const [playlists, liked] = await Promise.all([
    fetchAllPlaylistsWithSongs().catch(() => [] as PlaylistWithSongs[]),
    fetchLikedSongs().catch(() => [] as Song[]),
  ]);
  libraryCache = { playlists, liked, at: Date.now() };
  return libraryCache;
}

/** Drop the cache so the next command sees a playlist you just created. */
export function invalidateVoiceLibrary() {
  libraryCache = null;
}

export async function buildVoiceContext(pending: string[]): Promise<VoiceContext> {
  const lib = await loadVoiceLibrary();
  const playlists: VoicePlaylist[] = lib.playlists
    // An empty playlist cannot be played, so offering it as a match would
    // only produce a confident-sounding dead end.
    .filter((p) => p.songs.length > 0)
    .map((p) => ({ id: p.playlist.id, title: p.playlist.title, count: p.songs.length }));

  return {
    playlists,
    likedCount: lib.liked.length,
    pending,
    nowPlaying: usePlayerStore.getState().currentSong?.title ?? null,
  };
}

export interface Choice {
  title: string;
  subtitle: string;
  song: Song;
}

export interface Outcome {
  /** What to say back. Replaces the parser's guess when reality differed. */
  say: string;
  /** When present, a numbered list the next utterance can pick from. */
  choices?: Choice[];
}

function shuffled(songs: Song[]): Song[] {
  const a = [...songs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQueue(songs: Song[], source: 'playlist' | 'library', shuffle: boolean): boolean {
  if (songs.length === 0) return false;
  const queue = shuffle ? shuffled(songs) : songs;
  usePlayerStore.getState().play(queue[0], queue, source);
  return true;
}

async function searchYouTube(query: string): Promise<YtVideo[]> {
  try {
    const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { videos?: YtVideo[] };
    return (d.videos || []).filter((v) => v.videoId);
  } catch {
    return [];
  }
}

/**
 * Perform `action`. `say` is the parser's proposed reply, used only when
 * the action went as expected — if a playlist turned out to be empty or a
 * search found nothing, the outcome says what actually happened instead.
 *
 * `pending` is the list previously read out, needed to resolve a `choose`.
 */
export async function runVoiceAction(
  action: VoiceAction,
  say: string,
  pending: Choice[],
): Promise<Outcome> {
  const player = usePlayerStore.getState();

  switch (action.kind) {
    case 'transport': {
      if (action.op === 'pause') {
        player.pause();
        return { say: 'Paused.' };
      }
      if (action.op === 'resume') {
        if (!player.currentSong) return { say: 'Nothing is queued yet.' };
        player.resume();
        return { say: 'Playing.' };
      }
      if (!player.currentSong) return { say: 'Nothing is playing.' };
      if (action.op === 'next') {
        player.next();
        return { say: 'Next.' };
      }
      player.previous();
      return { say: 'Going back.' };
    }

    case 'shuffle': {
      // toggleShuffle is a toggle, so only flip it when it disagrees with
      // what was asked — "shuffle on" twice should not turn it off.
      if (player.shuffle !== action.on) player.toggleShuffle();
      return { say: action.on ? 'Shuffle on.' : 'Shuffle off.' };
    }

    case 'repeat': {
      player.setRepeat(action.mode);
      if (action.mode === 'off') return { say: 'Repeat off.' };
      if (action.mode === 'all') return { say: 'Repeating the whole queue.' };
      // Name the track back. "Repeating this song" is ambiguous at a glance
      // down at the wheel — hearing the title confirms it caught the right
      // one, which matters most when the command arrived mid-song.
      const title = player.currentSong?.title;
      return {
        say: title
          ? `Repeating ${title}.`
          : "Repeat is on — it'll loop whatever you play next.",
      };
    }

    case 'play_playlist': {
      const lib = await loadVoiceLibrary();
      const found = lib.playlists.find((p) => p.playlist.id === action.playlistId);
      if (!found) return { say: "I couldn't find that playlist." };
      if (!startQueue(found.songs, 'playlist', !!action.shuffle)) {
        return { say: `${found.playlist.title} is empty.` };
      }
      return {
        say: `${action.shuffle ? 'Shuffling' : 'Playing'} ${found.playlist.title}.`,
      };
    }

    case 'play_liked': {
      const lib = await loadVoiceLibrary();
      if (!startQueue(lib.liked, 'library', !!action.shuffle)) {
        return { say: 'You have no liked songs yet.' };
      }
      return {
        say: `${action.shuffle ? 'Shuffling' : 'Playing'} your liked songs.`,
      };
    }

    case 'play_all': {
      const lib = await loadVoiceLibrary();
      const all = buildCrossPlaylistQueue(lib.playlists);
      if (!startQueue(all, 'library', !!action.shuffle)) {
        return { say: 'There is nothing in your library yet.' };
      }
      return { say: action.shuffle ? 'Shuffling everything.' : 'Playing everything.' };
    }

    case 'search': {
      const videos = await searchYouTube(action.query);
      if (videos.length === 0) {
        return { say: `I couldn't find anything for ${action.query}.` };
      }

      // Hour-long jukebox uploads are the top hit for any "<movie> songs"
      // query and are useless as a numbered choice — you cannot tell what
      // you are getting and cannot skip within one. Dropped unless that is
      // all there is.
      const individual = videos.filter((v) => !isCompilation(v.title));
      const list = individual.length > 0 ? individual : videos;

      if (action.pick !== undefined) {
        const v = list[Math.min(action.pick, list.length) - 1];
        if (!v) return { say: "That one wasn't in the results." };
        const song = ytVideoToSong(v);
        usePlayerStore.getState().play(song, [song, ...list.slice(0, 10).map(ytVideoToSong)], 'library');
        return { say: `Playing ${song.title}.` };
      }

      if (action.autoplay) {
        const queue = list.slice(0, 15).map(ytVideoToSong);
        usePlayerStore.getState().play(queue[0], queue, 'library');
        return { say: `Playing ${queue[0].title}.` };
      }

      const choices: Choice[] = list.slice(0, 5).map((v) => ({
        title: v.title,
        subtitle: v.channel || 'YouTube',
        song: ytVideoToSong(v),
      }));
      return {
        say: `I found ${choices.length}. Which one — say first, second or third.`,
        choices,
      };
    }

    case 'choose': {
      const choice = pending[action.index - 1];
      if (!choice) return { say: "I don't have that one on the list." };
      // The rest of the list stays as the queue, so it keeps going after
      // the chosen track rather than stopping dead.
      const queue = [choice.song, ...pending.filter((_, i) => i !== action.index - 1).map((c) => c.song)];
      usePlayerStore.getState().play(choice.song, queue, 'library');
      return { say: `Playing ${choice.song.title}.` };
    }

    default:
      return { say: say || "Sorry, I didn't understand that." };
  }
}
