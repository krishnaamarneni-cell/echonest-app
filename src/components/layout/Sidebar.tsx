'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import {
  Home,
  Search,
  Library,
  PlusCircle,
  Upload,
  Heart,
  Settings,
  ListMusic,
  Music,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const mainNav = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Library', href: '/library', icon: Library },
  { label: 'Upload', href: '/upload', icon: Upload },
];

const libraryNav = [
  { label: 'Liked Songs', href: '/liked', icon: Heart },
  { label: 'Recently Played', href: '/recent', icon: Music },
  { label: 'YouTube Import', href: '/import', icon: ExternalLink },
];

type SidebarPlaylist = {
  id: string;
  title: string;
  href: string;
  kind: 'app' | 'youtube';
};

export function Sidebar() {
  const pathname = usePathname();
  const [playlists, setPlaylists] = useState<SidebarPlaylist[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [appRes, ytRes] = await Promise.all([
        supabase
          .from('playlists')
          .select('id, title, updated_at')
          .order('updated_at', { ascending: false })
          .limit(20),
        supabase
          .from('songs')
          .select('id, title, created_at')
          .eq('source', 'youtube_embed')
          .eq('youtube_kind', 'playlist')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const merged: SidebarPlaylist[] = [];
      if (appRes.data) {
        for (const p of appRes.data) {
          merged.push({
            id: p.id,
            title: p.title,
            href: `/playlist/${p.id}`,
            kind: 'app',
          });
        }
      }
      if (ytRes.data) {
        for (const p of ytRes.data) {
          merged.push({
            id: p.id,
            title: p.title,
            href: `/yt-playlist/${p.id}`,
            kind: 'youtube',
          });
        }
      }
      setPlaylists(merged);
    }

    load();
  }, [pathname]);

  return (
    <aside
      className="hidden lg:flex flex-col w-[var(--sidebar-width)] h-full bg-background border-r border-border"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <Link href="/" className="p-6 block hover:opacity-80 transition-opacity">
        <Logo />
      </Link>

      <nav className="px-3 space-y-1">
        {mainNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-accent-muted text-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 px-3 space-y-1">
        <p className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
          Your Music
        </p>
        {libraryNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
              pathname === item.href
                ? 'bg-accent-muted text-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 px-3 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Playlists
          </p>
          <Link
            href="/playlist/new"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5 pb-4">
          {playlists.map((playlist) => (
            <Link
              key={`${playlist.kind}-${playlist.id}`}
              href={playlist.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === playlist.href
                  ? 'bg-accent-muted text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              )}
            >
              <ListMusic className="w-4 h-4 flex-shrink-0" />
              <span className="truncate flex-1">{playlist.title}</span>
              {playlist.kind === 'youtube' && (
                <span className="text-[9px] font-bold bg-red-600 text-white px-1 py-0.5 rounded flex-shrink-0">
                  YT
                </span>
              )}
            </Link>
          ))}
          {playlists.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted text-center">
              No playlists yet
            </p>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-accent-muted text-accent'
              : 'text-muted-foreground hover:text-foreground hover:bg-card'
          )}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
