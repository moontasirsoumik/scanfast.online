import { useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent
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
  suppressClick: () => boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableThumb({ page, index, suppressClick, onEdit, onDelete }: SortableThumbProps) {
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
    zIndex: isDragging ? 20 : 'auto',
  };

  const handleClick = useCallback(() => {
    if (suppressClick()) {
      return;
    }
    onEdit(page.id);
  }, [onEdit, page.id, suppressClick]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`thumb-card${isDragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(page.id);
        }
      }}
      aria-label={`Page ${index + 1} — tap to edit`}
    >
      <img src={page.thumbnail} alt={`Page ${index + 1}`} className="thumb-img" draggable={false} />
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
  const dragStateRef = useRef({ suppressClickUntil: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const suppressClick = useCallback(() => Date.now() < dragStateRef.current.suppressClickUntil, []);

  const releaseDragState = useCallback(() => {
    dragStateRef.current.suppressClickUntil = Date.now() + 250;
  }, []);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    dragStateRef.current.suppressClickUntil = Number.POSITIVE_INFINITY;
  }, []);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    releaseDragState();
  }, [releaseDragState]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      releaseDragState();
      return;
    }

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      releaseDragState();
      return;
    }

    reorderPages(arrayMove(pages, oldIndex, newIndex));
    releaseDragState();
  }, [pages, reorderPages, releaseDragState]);

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="thumbnail-grid" role="list">
            {pages.map((page, i) => (
              <SortableThumb
                key={page.id}
                page={page}
                index={i}
                suppressClick={suppressClick}
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
