'use client';

import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { AudioPlayer } from './AudioPlayer';
import { InstallPrompt } from './InstallPrompt';
import { NowPlayingScreen } from './NowPlayingScreen';
import { AddToPlaylistDialog } from '@/components/ui/AddToPlaylistDialog';
import { usePlayerStore } from '@/store/player';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
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
    </div>
  );
}
