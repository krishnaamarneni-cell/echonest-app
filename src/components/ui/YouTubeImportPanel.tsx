'use client';

/**
 * Settings card that walks the user through:
 *   1. Signing into Google with the youtube.readonly scope (if not yet)
 *   2. Triggering the actual library import from YouTube → Supabase
 *
 * State machine:
 *   "checking"      — figuring out if we already have a token with the right scope
 *   "needs-connect" — show "Connect YouTube" button
 *   "ready"         — show "Import all" button
 *   "running"       — show progress
 *   "done"          — show summary
 *   "error"         — show error + retry
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { importYouTubeLibrary, ImportProgress } from '@/lib/youtubeImport';
import { Youtube, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

type State = 'checking' | 'needs-connect' | 'ready' | 'running' | 'done' | 'error';

export function YouTubeImportPanel() {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  // On mount: check if the current Supabase session has a Google provider
  // access token. We can't directly inspect its scopes from the client, so
  // we just check the token's presence — if the user signed in via Google
  // with youtube.readonly, this token can call the YouTube API.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      const token = session?.provider_token || null;
      if (token) {
        setProviderToken(token);
        setState('ready');
      } else {
        setState('needs-connect');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // If we just returned from OAuth with ?yt_import=1, start the import
  // immediately so the user doesn't have to click "Import all" again.
  useEffect(() => {
    if (state !== 'ready' || !providerToken) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_import') === '1') {
      // Strip the query param so refreshing doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, providerToken]);

  const connect = async () => {
    setError(null);
    const supabase = createClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // After OAuth, send users back to settings with a flag so the panel
    // starts the import without an extra click.
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: YT_SCOPE,
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/settings?yt_import=1')}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
    }
  };

  const run = async () => {
    if (!providerToken) {
      setError('No Google token in your session — try Connect again.');
      return;
    }
    setState('running');
    setError(null);
    try {
      await importYouTubeLibrary(providerToken, (p) => setProgress(p));
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };

  return (
    <section className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-600/20">
          <Youtube className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">Import from YouTube</h2>
          <p className="text-xs text-muted-foreground mt-1">
            One-tap import of every playlist you&apos;ve made on YouTube +
            your Liked Videos. Everything lands in your EchoNest library,
            ready to download for offline + background play.
          </p>

          {state === 'checking' && (
            <p className="text-xs text-muted mt-3 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking your
              Google connection…
            </p>
          )}

          {state === 'needs-connect' && (
            <button
              onClick={connect}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <Youtube className="w-3.5 h-3.5" /> Connect YouTube & Import
            </button>
          )}

          {state === 'ready' && (
            <button
              onClick={run}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Import all my playlists
            </button>
          )}

          {state === 'running' && progress && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-foreground inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress.message}
              </p>
              {progress.playlistsTotal > 0 && (
                <>
                  <div className="h-1.5 bg-card-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 transition-all duration-300"
                      style={{
                        width: `${(progress.playlistsDone / progress.playlistsTotal) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {progress.playlistsDone} of {progress.playlistsTotal}{' '}
                    playlists · {progress.songsAdded} songs imported
                  </p>
                </>
              )}
            </div>
          )}

          {state === 'done' && progress && (
            <div className="mt-3 flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">{progress.message}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="mt-3">
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-foreground">
                  Import failed — {error}
                </p>
              </div>
              <button
                onClick={() => (providerToken ? run() : connect())}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-semibold hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted">
        Imports your library only. Watch history isn&apos;t exposed by Google
        and can&apos;t be imported by any app.
      </p>
    </section>
  );
}
