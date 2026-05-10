import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { playlistUrl } = await request.json();

  if (!playlistUrl || typeof playlistUrl !== 'string') {
    return NextResponse.json({ error: 'Invalid playlist URL' }, { status: 400 });
  }

  const listId = extractPlaylistId(playlistUrl);
  if (!listId) {
    return NextResponse.json({ error: 'Could not extract playlist ID from URL' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API not configured' }, { status: 500 });
  }

  try {
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${listId}&key=${apiKey}`
    );
    const playlistData = await playlistRes.json();
    const playlistTitle = playlistData.items?.[0]?.snippet?.title || 'Imported Playlist';

    let items: { title: string; videoId: string; channel: string }[] = [];
    let nextPageToken = '';

    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${listId}&key=${apiKey}${
        nextPageToken ? `&pageToken=${nextPageToken}` : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        return NextResponse.json({ error: data.error.message }, { status: 400 });
      }

      const pageItems = (data.items || []).map(
        (item: { snippet: { title: string; resourceId: { videoId: string }; videoOwnerChannelTitle?: string } }) => ({
          title: item.snippet.title,
          videoId: item.snippet.resourceId.videoId,
          channel: item.snippet.videoOwnerChannelTitle || null,
        })
      );

      items = [...items, ...pageItems];
      nextPageToken = data.nextPageToken || '';
    } while (nextPageToken);

    const { data: userSongs } = await supabase
      .from('songs')
      .select('id, title, artist_name')
      .eq('user_id', user.id);

    const importItems = items.map((item) => {
      const matched = userSongs?.find((song) => {
        const titleMatch =
          song.title.toLowerCase().includes(item.title.toLowerCase()) ||
          item.title.toLowerCase().includes(song.title.toLowerCase());
        return titleMatch;
      });

      return {
        youtube_title: item.title,
        youtube_video_id: item.videoId,
        youtube_channel: item.channel,
        status: matched ? 'matched' : 'unmatched',
        matched_song_id: matched?.id || null,
      };
    });

    const { data: importRecord } = await supabase
      .from('youtube_imports')
      .insert({
        user_id: user.id,
        playlist_url: playlistUrl,
        playlist_title: playlistTitle,
      })
      .select('id')
      .single();

    if (importRecord) {
      await supabase.from('youtube_import_items').insert(
        importItems.map((item) => ({
          import_id: importRecord.id,
          ...item,
        }))
      );
    }

    return NextResponse.json({
      title: playlistTitle,
      items: importItems,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch playlist data' }, { status: 500 });
  }
}

function extractPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('list');
  } catch {
    return null;
  }
}
