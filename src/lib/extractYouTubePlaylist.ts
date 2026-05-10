export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
}

/**
 * Fetch the title + thumbnail of the playlist itself via the oEmbed endpoint.
 * Returns null if the playlist isn't accessible to oEmbed (private, etc).
 */
export async function fetchPlaylistMeta(
  playlistId: string,
): Promise<{ title: string; thumbnail: string | null } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${playlistId}&format=json`,
    );
    if (!res.ok) return null;
    const meta = await res.json();
    return {
      title: meta.title || 'Imported playlist',
      thumbnail: meta.thumbnail_url || null,
    };
  } catch {
    return null;
  }
}

export type YouTubeUrlKind =
  | { kind: 'video'; id: string }
  | { kind: 'playlist'; id: string }
  | null;

/**
 * Parse a YouTube URL and identify whether it's a single video or a playlist.
 */
export function parseYouTubeUrl(input: string): YouTubeUrlKind {
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

async function ensureYouTubeAPI(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.YT && window.YT.Player) return;

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
}

/**
 * Load a YouTube playlist via the IFrame API and extract every video's
 * id + metadata (title, author, thumbnail) using the public oEmbed endpoint.
 *
 * Throws if the playlist can't be embedded (private, deleted, or all videos
 * have embedding disabled by their uploaders).
 */
export async function extractYouTubePlaylist(
  playlistId: string,
): Promise<YouTubeVideoMeta[]> {
  await ensureYouTubeAPI();

  // Hidden off-screen container so the iframe doesn't show
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(container);

  const target = document.createElement('div');
  container.appendChild(target);

  return new Promise<YouTubeVideoMeta[]>((resolve, reject) => {
    let resolved = false;
    let player: ReturnType<typeof newYTPlayer> | null = null;

    const cleanup = () => {
      try {
        player?.destroy();
      } catch {}
      try {
        container.remove();
      } catch {}
    };

    const safeResolve = (v: YouTubeVideoMeta[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(v);
    };

    const safeReject = (e: Error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(e);
    };

    function newYTPlayer() {
      return new window.YT.Player(target, {
        height: '0',
        width: '0',
        playerVars: {
          listType: 'playlist',
          list: playlistId,
          autoplay: 0,
        },
        events: {
          onReady: async () => {
            try {
              const ids: string[] =
                (player as unknown as { getPlaylist: () => string[] })?.getPlaylist() || [];
              if (!ids.length) {
                safeReject(
                  new Error(
                    "Playlist is empty or couldn't be loaded. It may be private or all its videos may have embedding disabled.",
                  ),
                );
                return;
              }

              const results = await Promise.all(
                ids.map(async (videoId) => {
                  try {
                    const res = await fetch(
                      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
                    );
                    if (res.ok) {
                      const meta = await res.json();
                      return {
                        videoId,
                        title: meta.title || `Video ${videoId}`,
                        author: meta.author_name || 'YouTube',
                        thumbnail:
                          meta.thumbnail_url ||
                          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                      };
                    }
                  } catch {}
                  // Fallback metadata when oEmbed fails (private/deleted video)
                  return {
                    videoId,
                    title: `Video ${videoId}`,
                    author: 'YouTube',
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  };
                }),
              );

              safeResolve(results);
            } catch (e) {
              safeReject(e instanceof Error ? e : new Error(String(e)));
            }
          },
          onError: (e: { data?: number }) => {
            const codes: Record<number, string> = {
              2: 'Invalid playlist URL',
              5: 'Player error while loading playlist',
              100: 'Playlist not found or removed',
              101: 'Videos in this playlist have embedding blocked by their uploaders',
              150: 'Videos in this playlist have embedding blocked by their uploaders',
            };
            safeReject(
              new Error(codes[e.data || 0] || 'Could not load playlist'),
            );
          },
        },
      });
    }

    player = newYTPlayer();

    // Hard timeout — if YT's iframe never fires onReady or onError
    setTimeout(() => {
      safeReject(new Error('Timed out loading playlist'));
    }, 20000);
  });
}
