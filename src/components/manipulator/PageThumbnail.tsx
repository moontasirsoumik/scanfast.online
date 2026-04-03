import { useRef, useCallback } from 'react';
import type { PageData } from '@/services/pdf';
import './PageThumbnail.css';

interface PageThumbnailProps {
  page: PageData;
  index: number;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onLongPress?: () => void;
  onContextMenu?: (x: number, y: number) => void;
}

/** Truncate filename for badge display */
function truncName(name: string, max = 12): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) {
    const stem = name.slice(0, ext);
    const suffix = name.slice(ext);
    return stem.slice(0, max - suffix.length - 1) + '…' + suffix;
  }
  return name.slice(0, max - 1) + '…';
}

/** Thumbnail card for a single page with selection, long-press, and source badge */
export default function PageThumbnail({ page, index, selected, onClick, onLongPress, onContextMenu }: PageThumbnailProps) {
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

  const showSourceBadge = page.sourceFile !== 'blank';
  const badgeLabel = truncName(page.sourceFile);

  return (
    <button
      className={`thumb${selected ? ' selected' : ''}`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
      title={`${page.sourceFile} — Page ${index + 1}`}
      aria-label={`Page ${index + 1} — ${page.sourceFile}`}
      aria-pressed={selected}
    >
      <div className="thumb-preview">
        <img
          src={page.thumbnail}
          alt={`Page ${index + 1}`}
          style={{ transform: `rotate(${page.rotation}deg)` }}
          draggable={false}
        />
      </div>
      <span className="thumb-number">{index + 1}</span>
      {showSourceBadge && (
        <span className="source-badge" title={page.sourceFile}>{badgeLabel}</span>
      )}
    </button>
  );
}
