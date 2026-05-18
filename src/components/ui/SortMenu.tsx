'use client';

import { Menu } from './Menu';
import { ArrowUpDown, Check } from 'lucide-react';
import { SortKey, SORT_OPTIONS } from '@/lib/songSort';

interface SortMenuProps {
  value: SortKey;
  onChange: (k: SortKey) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const currentLabel = SORT_OPTIONS.find((o) => o.key === value)?.label || 'Sort';
  return (
    <Menu
      align="right"
      trigger={
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:bg-card-hover transition-colors"
          title="Sort"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {currentLabel}
        </button>
      }
      items={SORT_OPTIONS.map((o) => ({
        label: o.label,
        icon: o.key === value ? Check : undefined,
        onClick: () => onChange(o.key),
      }))}
    />
  );
}
