import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PageData } from '@/services/pdf';
import PageThumbnail from './PageThumbnail';
import './PageGrid.css';

interface PageGridProps {
  pages: PageData[];
  selectedIds: Set<string>;
  selectMode: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onReorder: (newPages: PageData[]) => void;
  onDelete?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

interface SortableItemProps {
  page: PageData;
  index: number;
  selected: boolean;
  selectMode: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onDelete?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

function SortableItem({ page, index, selected, selectMode, onSelect, onDelete, onLongPress, onContextMenu }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: page.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PageThumbnail
        page={page}
        index={index}
        selected={selected}
        selectMode={selectMode}
        onClick={(e) => onSelect(page.id, e)}
        onDelete={onDelete}
        onLongPress={() => onLongPress?.(page.id)}
        onContextMenu={(x, y) => onContextMenu?.(page.id, x, y)}
      />
    </div>
  );
}

/** Responsive sortable grid of page thumbnails with @dnd-kit drag-drop reorder */
export default function PageGrid({ pages, selectedIds, selectMode, onSelect, onReorder, onDelete, onLongPress, onContextMenu }: PageGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(pages, oldIndex, newIndex));
  }, [pages, onReorder]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="page-grid" role="grid" aria-label="Page grid — drag to reorder">
          {pages.map((page, i) => (
            <SortableItem
              key={page.id}
              page={page}
              index={i}
              selected={selectedIds.has(page.id)}
              selectMode={selectMode}
              onSelect={onSelect}
              onDelete={onDelete}
              onLongPress={onLongPress}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
