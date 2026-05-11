'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Upload,
  Link2,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Liked', href: '/liked', icon: Heart },
  { label: 'Library', href: '/library', icon: Library },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const go = (href: string) => {
    setSheetOpen(false);
    router.push(href);
  };

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-border"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
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
          <button
            onClick={() => setSheetOpen(true)}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 transition-colors',
              sheetOpen ? 'text-accent' : 'text-muted'
            )}
            aria-label="More actions"
          >
            <Plus className="w-5 h-5" />
            <span className="text-[10px] font-medium">Add</span>
          </button>
        </div>
      </nav>

      {/* Action sheet */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
          />
          <div
            className="absolute left-0 right-0 bottom-0 bg-card border-t border-border rounded-t-3xl shadow-2xl animate-slide-up"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Quick actions</h2>
              <button
                onClick={() => setSheetOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 pb-3 space-y-1">
              <SheetItem
                icon={Upload}
                title="Upload music"
                subtitle="Drop in audio files from your device"
                onClick={() => go('/upload')}
              />
              <SheetItem
                icon={Link2}
                title="Add from YouTube"
                subtitle="Paste a video or playlist URL"
                onClick={() => go('/upload#youtube')}
              />
              <SheetItem
                icon={Settings}
                title="Settings"
                subtitle="Background play, owner mode, your account"
                onClick={() => go('/settings')}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SheetItem({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-card-hover active:scale-[0.99] transition-all text-left"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-accent/20">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
    </button>
  );
}
