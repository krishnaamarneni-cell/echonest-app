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
import { createClient } from '@/lib/supabase/client';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  const hydrate = useOwnerMode((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Auto-sign-in as the public account when no session exists — UNLESS
  // the user explicitly signed out (we honor that and let them see the
  // login screen until they manually sign in again).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window !== 'undefined' &&
          localStorage.getItem('echonest-explicit-signout') === '1') {
        // User opted out — bounce to /login so they don't sit in an
        // unauthenticated app shell.
        window.location.href = '/login?manual=1';
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) return; // already signed in
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
