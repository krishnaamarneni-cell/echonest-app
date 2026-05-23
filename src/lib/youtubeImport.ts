/**
 * Import a signed-in Google user's YouTube library into EchoNest.
 *
 * Requires the user to have signed in with the `youtube.readonly` scope —
 * Supabase exposes the resulting Google access token at
 * `session.provider_token`. We use that token to call YouTube Data API v3
 * endpoints directly from the browser.
 *
 * What we pull:
 *  1. The user's playlists (playlists.list?mine=true)
 *  2. For each playlist, all the items (playlistItems.list?playlistId=X)
 *  3. Their Liked Videos via the special playlistId="LL"
 *
 * What we insert into Supabase:
 *  - One row in `playlists` per YouTube playlist (or reuse an existing one
 *    with the same source_youtube_id)
 *  - One row in `songs` per unique video (deduped by youtube_id, scoped to
 *    the user)
 *  - One row in `playlist_songs` linking each song to its playlist
 *  - The user's YouTube "Liked Videos" go into their OWN dedicated playlist
 *    ("Liked Videos (YouTube)", source_youtube_id="LL") — deliberately NOT
 *    into the `likes` table, so a user's YouTube-account likes stay separate
 *    from the songs they heart inside EchoNest.
 */

import { createClient } from '@/lib/supabase/client';

interface YTPlaylistSnippet {
  title?: string;
  description?: string;
  thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
  channelTitle?: string;
}

interface YTPlaylist {
  id: string;
  snippet?: YTPlaylistSnippet;
  contentDetails?: { itemCount?: number };
}

interface YTPlaylistItemSnippet {
  title?: string;
  videoOwnerChannelTitle?: string;
  channelTitle?: string;
  thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
  resourceId?: { videoId?: string };
}

interface YTPlaylistItem {
  snippet?: YTPlaylistItemSnippet;
}

export interface ImportProgress {
  phase: 'fetching' | 'importing' | 'done' | 'error';
  message: string;
  playlistsDone: number;
  playlistsTotal: number;
  songsAdded: number;
  likesAdded: number;
}

type ProgressCb = (p: ImportProgress) => void;

async function ytFetch<T>(
  url: string,
  token: string,
): Promise<T> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`YouTube ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

/**
 * Page through a YouTube Data API list endpoint, accumulating all items.
 * Each page costs ~1 quota unit. Worst case a user with 1000-item playlists
 * uses ~20 quota units for that playlist. Free quota is 10k/day, plenty.
 */
async function fetchAllPages<T>(
  buildUrl: (pageToken: string | null) => string,
  token: string,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | null = null;
  // Safety cap: 100 pages = 5000 items in any single list. Way more than
  // any realistic user playlist; prevents an infinite loop on a bad cursor.
  for (let pages = 0; pages < 100; pages++) {
    const url = buildUrl(pageToken);
    const data = (await ytFetch(url, token)) as {
      items?: T[];
      nextPageToken?: string;
    };
    out.push(...(data.items || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

function thumbOf(snip: { thumbnails?: YTPlaylistSnippet['thumbnails'] } | undefined): string | null {
  return (
    snip?.thumbnails?.high?.url ||
    snip?.thumbnails?.medium?.url ||
    snip?.thumbnails?.default?.url ||
    null
  );
}

/**
 * Main entrypoint. Pulls everything from the user's YouTube account and
 * writes it into Supabase. Calls `onProgress` after each major step.
 */
export async function importYouTubeLibrary(
  accessToken: string,
  onProgress: ProgressCb,
): Promise<{ playlists: number; songs: number; likes: number }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in');
  }

  const progress: ImportProgress = {
    phase: 'fetching',
    message: 'Loading your YouTube playlists…',
    playlistsDone: 0,
    playlistsTotal: 0,
    songsAdded: 0,
    likesAdded: 0,
  };
  onProgress(progress);

  // 1. Pull all the user's playlists
  const playlists = await fetchAllPages<YTPlaylist>(
    (pt) =>
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50${pt ? `&pageToken=${pt}` : ''}`,
    accessToken,
  );
  progress.playlistsTotal = playlists.length;
  progress.message = `Found ${playlists.length} playlist${playlists.length === 1 ? '' : 's'}. Importing…`;
  progress.phase = 'importing';
  onProgress({ ...progress });

  let totalSongs = 0;

  // 2. For each playlist: create the EchoNest playlist row + import its items
  for (const p of playlists) {
    const youtubePlaylistId = p.id;
    const title = p.snippet?.title || 'Untitled';
    const description = p.snippet?.description || null;
    const cover = thumbOf(p.snippet);

    progress.message = `Importing "${title}"…`;
    onProgress({ ...progress });

    // Dedupe by source_youtube_id within this user
    const { data: existingPlaylist } = await supabase
      .from('playlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_youtube_id', youtubePlaylistId)
      .maybeSingle();

    let playlistId: string;
    if (existingPlaylist) {
      playlistId = existingPlaylist.id as string;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('playlists')
        .insert({
          user_id: user.id,
          title,
          description,
          cover_url: cover,
          source_youtube_id: youtubePlaylistId,
          last_synced_at: new Date().toISOString(),
          content_type: 'music',
          is_public: false,
        })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        console.error('Failed to insert playlist', title, insertErr);
        continue;
      }
      playlistId = inserted.id as string;
    }

    // 3. Pull all items in this playlist
    const items = await fetchAllPages<YTPlaylistItem>(
      (pt) =>
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${youtubePlaylistId}&maxResults=50${pt ? `&pageToken=${pt}` : ''}`,
      accessToken,
    );

    // Existing song rows for this user, keyed by youtube_id
    const videoIds = items
      .map((it) => it.snippet?.resourceId?.videoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) {
      progress.playlistsDone += 1;
      onProgress({ ...progress });
      continue;
    }

    const { data: existingSongs } = await supabase
      .from('songs')
      .select('id, youtube_id')
      .eq('user_id', user.id)
      .in('youtube_id', videoIds);
    const existingMap = new Map<string, string>();
    for (const s of existingSongs || []) {
      existingMap.set((s as { youtube_id: string }).youtube_id, (s as { id: string }).id);
    }

    // Songs we need to create
    const toInsert: Record<string, unknown>[] = [];
    const seenInBatch = new Set<string>();
    for (const item of items) {
      const vid = item.snippet?.resourceId?.videoId;
      if (!vid) continue;
      if (existingMap.has(vid) || seenInBatch.has(vid)) continue;
      seenInBatch.add(vid);
      toInsert.push({
        user_id: user.id,
        title: item.snippet?.title || 'Untitled',
        artist_name:
          item.snippet?.videoOwnerChannelTitle ||
          item.snippet?.channelTitle ||
          'YouTube',
        duration: 0,
        file_url: '',
        cover_url: thumbOf(item.snippet),
        source: 'youtube_embed',
        youtube_id: vid,
        youtube_kind: 'video',
        content_type: 'music',
      });
    }

    if (toInsert.length > 0) {
      const { data: insertedSongs, error: songsErr } = await supabase
        .from('songs')
        .insert(toInsert)
        .select('id, youtube_id');
      if (!songsErr && insertedSongs) {
        for (const s of insertedSongs) {
          existingMap.set(
            (s as { youtube_id: string }).youtube_id,
            (s as { id: string }).id,
          );
          totalSongs += 1;
        }
      } else {
        console.error('Failed to insert songs for', title, songsErr);
      }
    }

    // 4. Link each item to the playlist (skip duplicates that are already linked)
    const { data: existingLinks } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId);
    const linkedSongIds = new Set(
      (existingLinks || []).map((r: { song_id: string }) => r.song_id),
    );

    const linkRows: Record<string, unknown>[] = [];
    let pos = linkedSongIds.size;
    for (const item of items) {
      const vid = item.snippet?.resourceId?.videoId;
      if (!vid) continue;
      const songId = existingMap.get(vid);
      if (!songId || linkedSongIds.has(songId)) continue;
      linkRows.push({
        playlist_id: playlistId,
        song_id: songId,
        position: pos++,
      });
      linkedSongIds.add(songId);
    }

    if (linkRows.length > 0) {
      const { error: linksErr } = await supabase
        .from('playlist_songs')
        .insert(linkRows);
      if (linksErr) console.error('Failed to link songs to playlist', title, linksErr);
    }

    progress.playlistsDone += 1;
    progress.songsAdded = totalSongs;
    onProgress({ ...progress });
  }

  // 5. Liked videos — YouTube's special playlist id "LL". These are kept
  //    SEPARATE from EchoNest's own Liked Songs (the `likes` table): we
  //    import them into a dedicated "Liked Videos (YouTube)" playlist so a
  //    user's YouTube-account likes don't get clubbed in with songs they
  //    hearted inside the app. May 404 for users who have history disabled;
  //    that's fine, we just skip.
  progress.message = 'Importing your liked videos…';
  onProgress({ ...progress });
  let likesAdded = 0;
  try {
    const likedItems = await fetchAllPages<YTPlaylistItem>(
      (pt) =>
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50${pt ? `&pageToken=${pt}` : ''}`,
      accessToken,
    );

    const likedVideoIds = likedItems
      .map((it) => it.snippet?.resourceId?.videoId)
      .filter((id): id is string => !!id);

    if (likedVideoIds.length > 0) {
      // Find-or-create the dedicated "Liked Videos (YouTube)" playlist,
      // keyed by the synthetic source id "LL" so re-syncs reuse it.
      const { data: existingLL } = await supabase
        .from('playlists')
        .select('id')
        .eq('user_id', user.id)
        .eq('source_youtube_id', 'LL')
        .maybeSingle();

      let llPlaylistId: string;
      if (existingLL) {
        llPlaylistId = existingLL.id as string;
      } else {
        const { data: insertedLL, error: llErr } = await supabase
          .from('playlists')
          .insert({
            user_id: user.id,
            title: 'Liked Videos (YouTube)',
            description: 'Your liked videos, synced from YouTube',
            cover_url: thumbOf(likedItems[0]?.snippet),
            source_youtube_id: 'LL',
            last_synced_at: new Date().toISOString(),
            content_type: 'music',
            is_public: false,
          })
          .select('id')
          .single();
        if (llErr || !insertedLL) {
          throw new Error(llErr?.message || 'Failed to create Liked Videos playlist');
        }
        llPlaylistId = insertedLL.id as string;
      }

      // Ensure a song row exists for each liked video
      const { data: existingForLikes } = await supabase
        .from('songs')
        .select('id, youtube_id')
        .eq('user_id', user.id)
        .in('youtube_id', likedVideoIds);
      const likeSongMap = new Map<string, string>();
      for (const s of existingForLikes || []) {
        likeSongMap.set(
          (s as { youtube_id: string }).youtube_id,
          (s as { id: string }).id,
        );
      }

      const toInsertSongs: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const item of likedItems) {
        const vid = item.snippet?.resourceId?.videoId;
        if (!vid || likeSongMap.has(vid) || seen.has(vid)) continue;
        seen.add(vid);
        toInsertSongs.push({
          user_id: user.id,
          title: item.snippet?.title || 'Untitled',
          artist_name:
            item.snippet?.videoOwnerChannelTitle ||
            item.snippet?.channelTitle ||
            'YouTube',
          duration: 0,
          file_url: '',
          cover_url: thumbOf(item.snippet),
          source: 'youtube_embed',
          youtube_id: vid,
          youtube_kind: 'video',
          content_type: 'music',
        });
      }
      if (toInsertSongs.length > 0) {
        const { data: insertedSongs } = await supabase
          .from('songs')
          .insert(toInsertSongs)
          .select('id, youtube_id');
        for (const s of insertedSongs || []) {
          likeSongMap.set(
            (s as { youtube_id: string }).youtube_id,
            (s as { id: string }).id,
          );
          totalSongs += 1;
        }
      }

      // Link each liked video to the LL playlist, skipping ones already linked
      const { data: existingLinks } = await supabase
        .from('playlist_songs')
        .select('song_id')
        .eq('playlist_id', llPlaylistId);
      const linkedSongIds = new Set(
        (existingLinks || []).map((r: { song_id: string }) => r.song_id),
      );

      const linkRows: Record<string, unknown>[] = [];
      let pos = linkedSongIds.size;
      for (const vid of likedVideoIds) {
        const sid = likeSongMap.get(vid);
        if (!sid || linkedSongIds.has(sid)) continue;
        linkedSongIds.add(sid);
        linkRows.push({ playlist_id: llPlaylistId, song_id: sid, position: pos++ });
      }
      if (linkRows.length > 0) {
        const { error: linksErr } = await supabase
          .from('playlist_songs')
          .insert(linkRows);
        if (!linksErr) likesAdded = linkRows.length;
      }
    }
  } catch (e) {
    // Liked videos are optional — many users have them set to private
    console.warn('Liked-videos import skipped:', e instanceof Error ? e.message : e);
  }

  progress.phase = 'done';
  progress.message = `Done. Imported ${playlists.length} playlist${playlists.length === 1 ? '' : 's'}, ${totalSongs} song${totalSongs === 1 ? '' : 's'}, ${likesAdded} liked video${likesAdded === 1 ? '' : 's'}.`;
  progress.songsAdded = totalSongs;
  progress.likesAdded = likesAdded;
  onProgress({ ...progress });

  return { playlists: playlists.length, songs: totalSongs, likes: likesAdded };
}
