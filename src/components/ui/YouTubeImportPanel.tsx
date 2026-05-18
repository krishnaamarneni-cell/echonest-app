'use client';

/**
 * Settings card for the YouTube → EchoNest integration.
 *
 * Three lifecycle paths:
 *  - User has never connected → show "Connect & Import"
 *  - User connected, mid-OAuth return → auto-run a sync
 *  - User connected previously → show "Last synced", "Sync now", and the
 *    auto-sync toggle. On mount, if auto-sync is on and the last sync is
 *    older than 24 h, trigger a sync transparently.
 */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { importYouTubeLibrary, ImportProgress } from '@/lib/youtubeImport';
import { Youtube, Loader2, CheckCircle2, AlertTriangle, Download, RefreshCw, Unlink } from 'lucide-react';

const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type State =
  | 'checking'
  | 'needs-connect'
  | 'ready'
  | 'running'
  | 'done'
  | 'error';

interface StoredTokens {
  last_synced_at: string | null;
  auto_sync_enabled: boolean;
  expires_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function YouTubeImportPanel() {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stored, setStored] = useState<StoredTokens | null>(null);

  // On mount: see if we already have a stored refresh token. If so the
  // user has connected before; otherwise show the Connect button.
  const loadStored = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState('needs-connect');
      return;
    }
    const { data: row } = await supabase
      .from('user_youtube_tokens')
      .select('last_synced_at, auto_sync_enabled, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (row) {
      setStored(row as StoredTokens);
      setState('ready');
    } else {
      setState('needs-connect');
    }
  }, []);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  /**
   * Get a fresh Google access token. First try the live Supabase session
   * (cheap, no network), and if that token isn't there or has expired,
   * fall back to the server-side /api/youtube/refresh endpoint which
   * uses the stored refresh_token + client secret.
   */
  const getAccessToken = useCallback(async (): Promise<string> => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const tok = data.session?.provider_token;
    if (tok) return tok;

    const r = await fetch('/api/youtube/refresh', { method: 'POST' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body?.access_token) {
      throw new Error(body?.error || `Refresh failed (${r.status})`);
    }
    return body.access_token as string;
  }, []);

  /**
   * Persist the session's provider tokens to user_youtube_tokens so we
   * can sync in the future without making the user reauth. Called once
   * right after the OAuth round-trip completes.
   */
  const saveTokensFromSession = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user } } = await supabase.auth.getUser();
    if (!session || !user) return;
    const accessToken = session.provider_token;
    // Refresh token is only present on the first OAuth callback; if we
    // already have a row from a previous flow we leave that refresh_token
    // alone. If neither is present we can't sync later.
    // @ts-expect-error provider_refresh_token isn't in the public TS types
    //  but Supabase populates it after Google OAuth with offline access.
    const refreshToken = session.provider_refresh_token as string | undefined;
    if (!accessToken) return;
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString(); // assume 1h, with safety
    // Upsert: keep the existing refresh_token if Google didn't send a new one
    const existing = await supabase
      .from('user_youtube_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();
    const finalRefresh =
      refreshToken || (existing.data?.refresh_token as string | undefined);
    if (!finalRefresh) {
      console.warn(
        'No refresh_token from Google. Background sync will need re-consent.',
      );
      return;
    }
    await supabase.from('user_youtube_tokens').upsert(
      {
        user_id: user.id,
        access_token: accessToken,
        refresh_token: finalRefresh,
        expires_at: expiresAt,
        scopes: YT_SCOPE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  }, []);

  /**
   * Run the actual library import. Used by the "Sync now" button, the
   * post-OAuth auto-trigger, and the stale-auto-sync auto-trigger.
   */
  const run = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      const accessToken = await getAccessToken();
      await importYouTubeLibrary(accessToken, (p) => setProgress(p));
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('user_youtube_tokens')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }
      setState('done');
      // Refresh stored info so the "last synced" display updates
      loadStored();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }, [getAccessToken, loadStored]);

  // Post-OAuth: ?yt_import=1 query param → store tokens then run
  useEffect(() => {
    if (state !== 'ready' && state !== 'needs-connect') return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_import') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      (async () => {
        await saveTokensFromSession();
        await loadStored();
        // Run an import right away with the freshly-stored session token
        run();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Stale auto-sync: if user has connected before, has auto-sync on, and
  // last sync is older than 24 h, transparently kick off a sync. Idle —
  // no UI other than the running state. Skipped if we're already running.
  useEffect(() => {
    if (state !== 'ready' || !stored) return;
    if (!stored.auto_sync_enabled) return;
    const last = stored.last_synced_at;
    const stale = !last || Date.now() - new Date(last).getTime() > STALE_AFTER_MS;
    if (!stale) return;
    // Only run if no yt_import flag (otherwise the other effect handles it)
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('yt_import') === '1'
    ) {
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stored]);

  const connect = async () => {
    setError(null);
    const supabase = createClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: YT_SCOPE,
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/settings?yt_import=1')}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (oauthErr) setError(oauthErr.message);
  };

  const toggleAutoSync = async () => {
    if (!stored) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const newVal = !stored.auto_sync_enabled;
    await supabase
      .from('user_youtube_tokens')
      .update({ auto_sync_enabled: newVal })
      .eq('user_id', user.id);
    setStored({ ...stored, auto_sync_enabled: newVal });
  };

  const disconnect = async () => {
    if (!confirm('Disconnect YouTube? Already-imported playlists stay in your library — just no more syncs.')) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_youtube_tokens').delete().eq('user_id', user.id);
    setStored(null);
    setState('needs-connect');
  };

  const isConnected = !!stored;

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
            your Liked Videos. Connect once — EchoNest syncs new additions
            automatically.
          </p>

          {state === 'checking' && (
            <p className="text-xs text-muted mt-3 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking…
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

          {state === 'ready' && isConnected && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Last synced:{' '}
                <span className="text-foreground font-medium">
                  {timeAgo(stored.last_synced_at)}
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={run}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-semibold hover:bg-red-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync now
                </button>
                <button
                  onClick={disconnect}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-card-hover border border-border text-foreground rounded-full text-xs font-medium hover:bg-card transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" /> Disconnect
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={stored.auto_sync_enabled}
                  onChange={toggleAutoSync}
                  className="rounded border-border accent-red-600"
                />
                <span className="text-muted-foreground">
                  Auto-sync once a day when I open EchoNest
                </span>
              </label>
            </div>
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
                onClick={() => (isConnected ? run() : connect())}
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
