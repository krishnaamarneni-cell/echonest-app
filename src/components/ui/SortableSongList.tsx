'use client';

/**
 * Drag-to-reorder song list for playlists + the play queue.
 *
 * Uses @dnd-kit/sortable which works on both desktop (mouse drag) and
 * mobile (touch drag with a 150ms long-press to differentiate from
 * scrolling).
 *
 * The parent passes:
 *   - items: an array with stable string ids (we sort by them)
 *   - renderItem: how to draw each row (it gets `attributes` + `listeners`
 *     for the drag handle from the sortable hook)
 *   - onReorder: called once with the new array order after the user drops
 *
 * The handle is shown on hover; on mobile the whole row acts as the handle
 * after a long-press, which is the iOS / Android pattern.
 */

import { ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableItemRenderArgs {
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
  isDragging: boolean;
  handle: ReactNode;
}

interface SortableSongListProps<T extends { id: string }> {
  items: T[];
  onReorder: (newOrder: T[]) => void;
  renderItem: (item: T, index: number, args: SortableItemRenderArgs) => ReactNode;
}

export function SortableSongList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: SortableSongListProps<T>) {
  const sensors = useSensors(
    // Require a small mouse movement before initiating drag so single
    // clicks on the row still trigger play
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch needs a long-press otherwise it conflicts with scrolling
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item, idx) => (
          <SortableRow key={item.id} id={item.id}>
            {(args) => renderItem(item, idx, args)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (args: SortableItemRenderArgs) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      title="Drag to reorder"
      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes, isDragging, handle })}
    </div>
  );
}
