'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface MenuProps {
  trigger: React.ReactElement;
  items: MenuItem[];
  align?: 'left' | 'right';
  direction?: 'up' | 'down' | 'auto';
}

export function Menu({
  trigger,
  items,
  align = 'right',
  direction = 'auto',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [resolvedDirection, setResolvedDirection] = useState<'up' | 'down'>(
    direction === 'up' ? 'up' : 'down',
  );
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-detect: flip direction if the menu would overflow the viewport
  useLayoutEffect(() => {
    if (!open) return;
    if (direction !== 'auto') {
      setResolvedDirection(direction);
      return;
    }
    if (!triggerRef.current || !panelRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow) {
      setResolvedDirection('up');
    } else {
      setResolvedDirection('down');
    }
  }, [open, direction]);

  return (
    <div ref={ref} className="relative inline-block">
      <span
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          ref={panelRef}
          className={`absolute z-50 min-w-[180px] py-1 bg-card border border-border rounded-xl shadow-2xl animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${resolvedDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                item.variant === 'danger'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-card-hover'
              }`}
            >
              {item.icon && <item.icon className="w-4 h-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
