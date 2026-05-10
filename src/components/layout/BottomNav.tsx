'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Library, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/player';

const navItems = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Library', href: '/library', icon: Library },
  { label: 'Upload', href: '/upload', icon: Upload },
];

export function BottomNav() {
  const pathname = usePathname();
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);

  return (
    <nav
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-border transition-transform',
        isPlayerVisible && 'bottom-[var(--player-height)]'
      )}
    >
      <div className="flex items-center justify-around h-[var(--bottom-nav-height)]">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 transition-colors',
                isActive ? 'text-accent' : 'text-muted'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
