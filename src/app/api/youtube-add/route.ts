import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Parsed =
  | { kind: 'video'; id: string }
  | { kind: 'playlist'; id: string }
  | null;

function parseYouTubeUrl(input: string): Parsed {
  let url: URL;
  try {
    const trimmed = input.trim();
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id ? { kind: 'video', id } : null;
  }

  if (host !== 'youtube.com') return null;

  const list = url.searchParams.get('list');
  const v = url.searchParams.get('v');

  if (url.pathname === '/playlist' && list) return { kind: 'playlist', id: list };
  if (v) return { kind: 'video', id: v };
  if (url.pathname.startsWith('/embed/')) {
    const seg = url.pathname.split('/')[2];
    if (seg) return { kind: 'video', id: seg };
  }
  if (url.pathname.startsWith('/shorts/')) {
    const seg = url.pathname.split('/')[2];
    if (seg) return { kind: 'video', id: seg };
  }
  if (list) return { kind: 'playlist', id: list };

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { url, contentType } = await request.json();
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }
  const allowedTypes = ['music', 'podcast', 'artist', 'album'] as const;
  type ContentType = (typeof allowedTypes)[number];
  const safeContentType: ContentType = allowedTypes.includes(contentType)
    ? (contentType as ContentType)
    : 'music';

  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Could not parse YouTube URL. Paste a video URL (youtube.com/watch?v=...) or playlist URL (youtube.com/playlist?list=...)' },
      { status: 400 }
    );
  }

  const oembedUrl =
    parsed.kind === 'video'
      ? `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${parsed.id}&format=json`
      : `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${parsed.id}&format=json`;

  let title = parsed.kind === 'playlist' ? 'YouTube Playlist' : 'Untitled';
  let author = 'YouTube';
  let thumbnail =
    parsed.kind === 'video'
      ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`
      : null;

  try {
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const meta = await res.json();
      title = meta.title || title;
      author = meta.author_name || author;
      thumbnail = meta.thumbnail_url || thumbnail;
    } else if (parsed.kind === 'playlist') {
      title = 'YouTube Playlist';
    }
  } catch {
    // Continue with defaults — playlist oEmbed sometimes fails
  }

  const { data: song, error } = await supabase
    .from('songs')
    .insert({
      user_id: user.id,
      title,
      artist_name: author,
      cover_url: thumbnail,
      file_url: '',
      duration: 0,
      source: 'youtube_embed',
      youtube_id: parsed.id,
      youtube_kind: parsed.kind,
      content_type: safeContentType,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ song });
}
