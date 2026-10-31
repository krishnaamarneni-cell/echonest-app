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
 * The handle is for mouse and keyboard. On touch, the caller spreads
 * `listeners` onto the whole row so a long-press anywhere starts the drag,
 * which is the iOS / Android pattern.
 *
 * Note there is deliberately NO `touch-action: none` on the row. dnd-kit's
 * docs suggest it for draggables, but on a full-width row it would kill
 * scrolling for the whole list. The TouchSensor's delay + tolerance is the
 * supported alternative: a finger that moves before the delay elapses
 * scrolls, one that stays put starts a drag.
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
  /**
   * How long a finger must rest before a drag begins, in ms.
   *
   * 200 suits the queue: a short, modal list you barely scroll. A library
   * page is long and scrolled constantly, so it wants a more deliberate
   * press — but nowhere near the 3-5s people imagine, because past about
   * half a second it reads as "nothing happened" and they let go.
   */
  touchDelay?: number;
}

export function SortableSongList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  touchDelay = 200,
}: SortableSongListProps<T>) {
  const sensors = useSensors(
    // Require a small mouse movement before initiating drag so single
    // clicks on the row still trigger play
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch needs a long-press otherwise it conflicts with scrolling
    useSensor(TouchSensor, {
      activationConstraint: { delay: touchDelay, tolerance: 8 },
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

  // Scale + shadow rather than the old opacity fade: a half-transparent
  // row reads as "disabled", where lifting it off the page reads as "I am
  // holding this", which is the whole point of the gesture.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1.02, scaleY: 1.02 } : transform,
    ),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' : undefined,
    boxShadow: isDragging ? '0 12px 32px rgba(0,0,0,0.55)' : undefined,
    borderRadius: isDragging ? '0.5rem' : undefined,
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
