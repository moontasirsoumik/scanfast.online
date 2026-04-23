import { useCallback, useRef, useState, useEffect } from 'react';
import { Button } from '@carbon/react';
import {
  CheckboxChecked,
  Rotate,
  Copy,
  DocumentBlank,
  TrashCan,
  SplitScreen,
  Minimize,
  Undo,
  Redo,
  WatsonHealthTextAnnotationToggle,
  ListNumbered,
  Locked,
  Unlocked,
  ChevronLeft,
  ChevronRight,
} from '@carbon/icons-react';
import './Toolbar.css';

interface ToolbarProps {
  pageCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
  maxPages: number;
  onRotate: () => void;
  onDuplicate: () => void;
  onInsertBlank: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onCompress: () => void;
  onWatermark: () => void;
  onPageNumbers: () => void;
  onProtect: () => void;
  onUnlock: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
}

/** Horizontal toolbar with grouped page operations — tools scroll, undo/redo pinned */
export default function Toolbar({
  pageCount, selectedCount, canUndo, canRedo, isLoading, maxPages,
  onRotate, onDuplicate, onInsertBlank, onDelete,
  onSplit, onCompress, onWatermark, onPageNumbers,
  onProtect, onUnlock,
  onUndo, onRedo, onSelectAll
}: ToolbarProps) {
  const atPageLimit = pageCount >= maxPages;
  const noSelection = selectedCount === 0;
  const noPages = pageCount === 0;
  const selectionLabel = selectedCount > 0 ? 'Unselect All' : 'Select All';
  const selectionDescription = selectedCount > 0 ? 'Unselect all pages' : 'Select all pages';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const rafRef = useRef<number | null>(null);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    el.addEventListener('scroll', updateScrollState, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  const startScroll = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = () => {
      el.scrollLeft += dir * 4;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const stopScroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Also support mouse wheel for power users */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div className="toolbar" role="toolbar" aria-label="Page operations" aria-orientation="horizontal">
      {/* Left scroll arrow — only shown on desktop when there's content to the left */}
      <button
        className={`toolbar-arrow toolbar-arrow--left${canScrollLeft ? ' toolbar-arrow--visible' : ''}`}
        aria-label="Scroll tools left"
        aria-hidden={!canScrollLeft}
        tabIndex={canScrollLeft ? 0 : -1}
        onMouseDown={() => startScroll(-1)}
        onMouseUp={stopScroll}
        onMouseLeave={stopScroll}
        onTouchStart={() => startScroll(-1)}
        onTouchEnd={stopScroll}
      >
        <ChevronLeft size={16} />
      </button>

      <div className="toolbar-scroll" ref={scrollRef} onWheel={handleWheel}>
        <div className="toolbar-group">
          <Button kind="ghost" size="sm" renderIcon={CheckboxChecked} iconDescription={selectionDescription} disabled={noPages} onClick={onSelectAll}>
            {selectionLabel}
          </Button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <Button kind="ghost" size="sm" renderIcon={Rotate} iconDescription="Rotate" disabled={noSelection} onClick={onRotate}>
            Rotate
          </Button>
          <Button kind="ghost" size="sm" renderIcon={Copy} iconDescription="Copy page" disabled={noSelection} onClick={onDuplicate}>
            Copy Page
          </Button>
          <Button kind="ghost" size="sm" renderIcon={DocumentBlank} iconDescription="Add blank page" disabled={atPageLimit || isLoading} onClick={onInsertBlank}>
            Add Blank
          </Button>
          <Button kind="ghost" size="sm" renderIcon={TrashCan} iconDescription="Delete" disabled={noSelection} onClick={onDelete}>
            Delete
          </Button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <Button kind="ghost" size="sm" renderIcon={SplitScreen} iconDescription="Split PDF" disabled={noPages} onClick={onSplit}>
            Split PDF
          </Button>
          <Button kind="ghost" size="sm" renderIcon={Minimize} iconDescription="Compress" disabled={noSelection} onClick={onCompress}>
            Compress
          </Button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <Button kind="ghost" size="sm" renderIcon={WatsonHealthTextAnnotationToggle} iconDescription="Watermark" disabled={noPages} onClick={onWatermark}>
            Watermark
          </Button>
          <Button kind="ghost" size="sm" renderIcon={ListNumbered} iconDescription="Page numbers" disabled={noPages} onClick={onPageNumbers}>
            Page #
          </Button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <Button kind="ghost" size="sm" renderIcon={Locked} iconDescription="Protect PDF" disabled={noPages} onClick={onProtect}>
            Protect
          </Button>
          <Button kind="ghost" size="sm" renderIcon={Unlocked} iconDescription="Unlock PDF" onClick={onUnlock}>
            Unlock
          </Button>
        </div>
      </div>

      {/* Right scroll arrow — only shown on desktop when there's content to the right */}
      <button
        className={`toolbar-arrow toolbar-arrow--right${canScrollRight ? ' toolbar-arrow--visible' : ''}`}
        aria-label="Scroll tools right"
        aria-hidden={!canScrollRight}
        tabIndex={canScrollRight ? 0 : -1}
        onMouseDown={() => startScroll(1)}
        onMouseUp={stopScroll}
        onMouseLeave={stopScroll}
        onTouchStart={() => startScroll(1)}
        onTouchEnd={stopScroll}
      >
        <ChevronRight size={16} />
      </button>

      <div className="toolbar-group toolbar-group--history">
        <Button kind="ghost" size="sm" renderIcon={Undo} iconDescription="Undo" disabled={!canUndo} onClick={onUndo} hasIconOnly />
        <Button kind="ghost" size="sm" renderIcon={Redo} iconDescription="Redo" disabled={!canRedo} onClick={onRedo} hasIconOnly />
      </div>
    </div>
  );
}
