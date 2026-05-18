'use client';

import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { AudioPlayer } from './AudioPlayer';
import { InstallPrompt } from './InstallPrompt';
import { NowPlayingScreen } from './NowPlayingScreen';
import { ListenAlongSync } from './ListenAlongSync';
import { RoomIndicator } from './RoomIndicator';
import { AddToPlaylistDialog } from '@/components/ui/AddToPlaylistDialog';
import { usePlayerStore } from '@/store/player';
import { useOwnerMode } from '@/store/ownerMode';
import { useOfflineStore } from '@/store/offline';
import { createClient } from '@/lib/supabase/client';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  const hydrate = useOwnerMode((s) => s.hydrate);
  const loadOfflineIds = useOfflineStore((s) => s.loadIds);

  useEffect(() => {
    hydrate();
    // Populate the in-memory set of downloaded song ids so SongRow etc.
    // can synchronously render their "downloaded" badge from first paint.
    loadOfflineIds();
  }, [hydrate, loadOfflineIds]);

  // Auto-sign-in as the public account when no session exists — UNLESS
  // the user explicitly signed out (we honor that and let them see the
  // login screen until they manually sign in again).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Check the live session FIRST. If the user has a real session
      // (e.g. just signed in via Google), respect it and clear any
      // stale "I signed out" flag — otherwise the next time they land
      // here we'd bounce them to /login and they'd loop back via the
      // OAuth callback in an endless refresh.
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('echonest-explicit-signout');
          // If this is an OAuth-based session (Google, etc.) the user is
          // signed in as themselves, not the shared public account — they
          // are the owner of their own library. Auto-unlock owner mode so
          // they see their settings + profile instead of the public-visitor
          // "Make it yours" view. We use app_metadata.provider which is
          // populated by Supabase to either 'email' (password login or
          // public auto-signin) or a real provider name like 'google'.
          const provider = data.session.user?.app_metadata?.provider;
          if (provider && provider !== 'email') {
            localStorage.setItem('echonest-owner-mode', '1');
          }
        }
        return;
      }

      // No session. If the user previously explicitly signed out,
      // honor that and send them to the manual sign-in form rather
      // than silently logging them into the public account.
      if (typeof window !== 'undefined' &&
          localStorage.getItem('echonest-explicit-signout') === '1') {
        window.location.href = '/login?manual=1';
        return;
      }

      try {
        const res = await fetch('/api/public-session', { method: 'POST' });
        if (res.ok && !cancelled) {
          // Reload so the new session cookies take effect everywhere
          window.location.reload();
        }
      } catch {
        // No public account configured or network error — leave as-is
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          paddingTop: 'var(--safe-top)',
          paddingBottom: isPlayerVisible
            ? 'calc(var(--player-height) + var(--total-bottom-nav))'
            : 'var(--total-bottom-nav)',
        }}
      >
        {children}
      </main>
      <AudioPlayer />
      <BottomNav />
      <InstallPrompt />
      <AddToPlaylistDialog />
      <NowPlayingScreen />
      <ListenAlongSync />
      <RoomIndicator />
    </div>
  );
}
