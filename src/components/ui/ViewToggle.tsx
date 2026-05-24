'use client';

import { LayoutGrid, List } from 'lucide-react';

export function ViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'grid';
  onChange: (v: 'list' | 'grid') => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange('list')}
        aria-label="List view"
        title="List view"
        className={`p-2 rounded-lg transition-colors ${
          view === 'list' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-card'
        }`}
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        title="Grid view"
        className={`p-2 rounded-lg transition-colors ${
          view === 'grid' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-card'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}
