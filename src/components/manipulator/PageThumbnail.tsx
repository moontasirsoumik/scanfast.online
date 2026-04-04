import { useRef, useCallback } from 'react';
import { Close, Checkmark } from '@carbon/icons-react';
import type { PageData } from '@/services/pdf';
import './PageThumbnail.css';

interface PageThumbnailProps {
  page: PageData;
  index: number;
  selected: boolean;
  selectMode: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
  onContextMenu?: (x: number, y: number) => void;
}

/** Thumbnail card for a single page with selection, delete, and long-press */
export default function PageThumbnail({ page, index, selected, selectMode, onClick, onDelete, onLongPress, onContextMenu }: PageThumbnailProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressFired.current = false;
    const touch = e.touches[0];
    touchPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      navigator.vibrate?.(50);
      onLongPress?.();
      onContextMenu?.(touchPos.current.x, touchPos.current.y);
    }, 500);
  }, [onLongPress, onContextMenu]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onClick(e);
  }, [onClick]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(page.id);
  }, [onDelete, page.id]);

  return (
    <div
      className={`thumb-card${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(e as unknown as React.MouseEvent); }}
      title={`${page.sourceFile} — Page ${index + 1}`}
      aria-label={`Page ${index + 1} — ${page.sourceFile}`}
      aria-pressed={selected}
    >
      <img
        src={page.thumbnail}
        alt={`Page ${index + 1}`}
        className="thumb-img"
        style={{ transform: `rotate(${page.rotation}deg)` }}
        draggable={false}
      />
      <span className="page-badge">{index + 1}</span>
      {selectMode && (
        <span className={`select-check${selected ? ' checked' : ''}`}>
          {selected && <Checkmark size={12} />}
        </span>
      )}
      {onDelete && !selectMode && (
        <button
          className="delete-btn"
          onClick={handleDelete}
          aria-label={`Delete page ${index + 1}`}
        >
          <Close size={14} />
        </button>
      )}
    </div>
  );
}
