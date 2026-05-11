import { createClient } from './supabase/client';
import {
  extractYouTubePlaylistIds,
  fetchVideoMeta,
} from './extractYouTubePlaylist';

export interface SyncResult {
  added: number;
  removed: number;
  skipped: number;
  total: number;
  error?: string;
}

/**
 * Re-fetch a YouTube playlist and add any new videos to an existing EchoNest
 * playlist. Already-saved videos are skipped — only the diff is fetched and
 * inserted, so syncing a 2000-video playlist with 3 new ones is fast.
 */
export async function syncYouTubePlaylist(opts: {
  playlistDbId: string;
  sourceYoutubeId: string;
  contentType?: 'music' | 'podcast' | 'artist' | 'album';
}): Promise<SyncResult> {
  const { playlistDbId, sourceYoutubeId, contentType = 'music' } = opts;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { added: 0, removed: 0, skipped: 0, total: 0, error: 'Not signed in' };

  // 1. Fetch current video IDs from the YouTube playlist.
  // Try the server endpoint first (unlimited size). Fall back to client-side
  // (capped at 200) if no API key configured.
  type VideoMeta = { videoId: string; title: string; author: string; thumbnail: string };
  let ytIds: string[];
  let serverMeta: VideoMeta[] | null = null;
  try {
    const serverRes = await fetch('/api/youtube-playlist-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId: sourceYoutubeId }),
    });
    if (serverRes.ok) {
      const data = await serverRes.json();
      serverMeta = data.videos as VideoMeta[];
      ytIds = serverMeta.map((v) => v.videoId);
    } else {
      ytIds = await extractYouTubePlaylistIds(sourceYoutubeId);
    }
  } catch (e) {
    try {
      ytIds = await extractYouTubePlaylistIds(sourceYoutubeId);
    } catch (inner) {
      return {
        added: 0,
        removed: 0,
        skipped: 0,
        total: 0,
        error:
          inner instanceof Error
            ? inner.message
            : e instanceof Error
            ? e.message
            : 'Failed to load playlist',
      };
    }
  }
  if (!ytIds.length) return { added: 0, removed: 0, skipped: 0, total: 0 };

  // 2. Find existing playlist_songs and compute the diff in both directions:
  //    - new YT ids → add
  //    - links whose video is no longer in YT → remove
  const { data: playlistSongs } = await supabase
    .from('playlist_songs')
    .select('id, song_id, song:songs(youtube_id)')
    .eq('playlist_id', playlistDbId);

  const existingVideoIds = new Set<string>();
  const linkIdsToDelete: string[] = [];
  const ytIdSet = new Set(ytIds);
  for (const row of playlistSongs || []) {
    const r = row as unknown as {
      id: string;
      song: { youtube_id?: string } | { youtube_id?: string }[] | null;
    };
    const song = Array.isArray(r.song) ? r.song[0] : r.song;
    const vid = song?.youtube_id;
    if (vid) {
      existingVideoIds.add(vid);
      if (!ytIdSet.has(vid)) linkIdsToDelete.push(r.id);
    }
  }

  // Remove links for videos that disappeared from YouTube. We unlink rather
  // than delete the song record itself — the user may want it elsewhere.
  let removedCount = 0;
  if (linkIdsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('playlist_songs')
      .delete()
      .in('id', linkIdsToDelete);
    if (!delErr) removedCount = linkIdsToDelete.length;
  }

  const newVideoIds = ytIds.filter((id) => !existingVideoIds.has(id));

  if (newVideoIds.length === 0) {
    // Nothing new to add — bump last_synced_at and return removal count
    await supabase
      .from('playlists')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', playlistDbId);
    return {
      added: 0,
      removed: removedCount,
      skipped: ytIds.length,
      total: ytIds.length,
    };
  }

  // 3. Check if any new IDs already exist as songs in the user's library
  // (could be in another playlist) — if so, we just link them, don't re-insert.
  const { data: existingSongs } = await supabase
    .from('songs')
    .select('id, youtube_id')
    .eq('user_id', user.id)
    .eq('source', 'youtube_embed')
    .eq('youtube_kind', 'video')
    .in('youtube_id', newVideoIds);

  const existingSongMap = new Map<string, string>(); // videoId -> songId
  for (const s of existingSongs || []) {
    if (s.youtube_id) existingSongMap.set(s.youtube_id as string, s.id as string);
  }

  const idsToFetch = newVideoIds.filter((id) => !existingSongMap.has(id));

  // 4. Get metadata for the new videos. Prefer the server-provided metadata
  // (already fetched in one paginated API call); only fall back to per-video
  // oEmbed if the server wasn't used.
  let metas: VideoMeta[];
  if (serverMeta) {
    const byId = new Map(serverMeta.map((v) => [v.videoId, v]));
    metas = idsToFetch
      .map((id) => byId.get(id))
      .filter((v): v is VideoMeta => v !== undefined);
  } else if (idsToFetch.length > 0) {
    metas = await Promise.all(idsToFetch.map((id) => fetchVideoMeta(id)));
  } else {
    metas = [];
  }

  // 5. Insert new songs
  const insertedMap = new Map<string, string>();
  if (metas.length > 0) {
    const rows = metas.map((m) => ({
      user_id: user.id,
      title: m.title,
      artist_name: m.author,
      cover_url: m.thumbnail,
      file_url: '',
      duration: 0,
      source: 'youtube_embed',
      youtube_id: m.videoId,
      youtube_kind: 'video',
      content_type: contentType,
    }));
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { data: created, error } = await supabase
        .from('songs')
        .insert(batch)
        .select('id, youtube_id');
      if (error) {
        return {
          added: 0,
          removed: removedCount,
          skipped: 0,
          total: ytIds.length,
          error: error.message,
        };
      }
      for (const s of created || []) {
        if (s.youtube_id) insertedMap.set(s.youtube_id as string, s.id as string);
      }
    }
  }

  // 6. Get the next free position in this playlist
  const { data: maxRow } = await supabase
    .from('playlist_songs')
    .select('position')
    .eq('playlist_id', playlistDbId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPosition = (maxRow?.position ?? -1) + 1;

  // 7. Link new videos to the playlist (preserving YT playlist order)
  const linkRows = newVideoIds
    .map((videoId) => {
      const songId = insertedMap.get(videoId) || existingSongMap.get(videoId);
      if (!songId) return null;
      return {
        playlist_id: playlistDbId,
        song_id: songId,
        position: nextPosition++,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (linkRows.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < linkRows.length; i += batchSize) {
      const batch = linkRows.slice(i, i + batchSize);
      const { error } = await supabase.from('playlist_songs').insert(batch);
      if (error) {
        return {
          added: 0,
          removed: removedCount,
          skipped: 0,
          total: ytIds.length,
          error: error.message,
        };
      }
    }
  }

  // 8. Bump last_synced_at + updated_at
  await supabase
    .from('playlists')
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', playlistDbId);

  return {
    added: linkRows.length,
    removed: removedCount,
    skipped: ytIds.length - linkRows.length,
    total: ytIds.length,
  };
}
