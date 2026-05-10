'use client';

import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { AudioPlayer } from './AudioPlayer';
import { InstallPrompt } from './InstallPrompt';
import { AddToPlaylistDialog } from '@/components/ui/AddToPlaylistDialog';
import { usePlayerStore } from '@/store/player';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main
        className={`flex-1 overflow-y-auto ${
          isPlayerVisible
            ? 'pb-[calc(var(--player-height)+var(--bottom-nav-height))] lg:pb-[var(--player-height)]'
            : 'pb-[var(--bottom-nav-height)] lg:pb-0'
        }`}
      >
        {children}
      </main>
      <AudioPlayer />
      <BottomNav />
      <InstallPrompt />
      <AddToPlaylistDialog />
    </div>
  );
}
