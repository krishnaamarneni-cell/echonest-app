'use client';

import { useEffect, useRef, useState } from 'react';
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
}

export function Menu({ trigger, items, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative inline-block">
      <span
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
          className={`absolute z-50 mt-1 min-w-[180px] py-1 bg-card border border-border rounded-xl shadow-2xl animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
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
