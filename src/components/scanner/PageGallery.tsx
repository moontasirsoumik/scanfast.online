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
import { Button } from '@carbon/react';
import { Close } from '@carbon/icons-react';
import type { ScannedPage } from '@/stores/scanner';
import { useScannerStore } from '@/stores/scanner';
import './PageGallery.css';

interface PageGalleryProps {
  pages: ScannedPage[];
  maxPages: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

interface SortableThumbProps {
  page: ScannedPage;
  index: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableThumb({ page, index, onEdit, onDelete }: SortableThumbProps) {
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
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`thumb-card${isDragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(page.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(page.id); }}
      aria-label={`Page ${index + 1} — tap to edit`}
    >
      <img src={page.thumbnail} alt={`Page ${index + 1}`} className="thumb-img" />
      <span className="page-badge">{index + 1}</span>
      <button
        className="delete-btn"
        onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
        aria-label={`Delete page ${index + 1}`}
      >
        <Close size={14} />
      </button>
    </div>
  );
}

/** Vertical grid page gallery with DnD reorder */
export default function PageGallery({ pages, maxPages, onEdit, onDelete }: PageGalleryProps) {
  const reorderPages = useScannerStore((s) => s.reorderPages);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    reorderPages(arrayMove(pages, oldIndex, newIndex));
  }, [pages, reorderPages]);

  if (pages.length === 0) {
    return (
      <div className="page-gallery">
        <div className="empty-state">
          <p>No pages scanned yet. Capture your first page to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-gallery">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="thumbnail-grid" role="list">
            {pages.map((page, i) => (
              <SortableThumb
                key={page.id}
                page={page}
                index={i}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
