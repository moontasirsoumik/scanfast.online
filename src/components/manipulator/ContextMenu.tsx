import { useEffect, useRef, useCallback } from 'react';
import { Rotate, Copy, TrashCan, DocumentBlank } from '@carbon/icons-react';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  open: boolean;
  onClose: () => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertBlank: () => void;
}

/** Floating context menu for page thumbnail long-press */
export default function ContextMenu({
  x, y, open, onClose, onRotate, onDuplicate, onDelete, onInsertBlank
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent overflow off-screen
  const adjustedStyle = useCallback((): React.CSSProperties => {
    const menuW = 200;
    const menuH = 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      left: Math.min(x, vw - menuW),
      top: Math.min(y, vh - menuH),
    };
  }, [x, y]);

  if (!open) return null;

  const handle = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} />
      <div className="context-menu" ref={menuRef} style={adjustedStyle()} role="menu">
        <button className="context-menu-item" role="menuitem" onClick={() => handle(onRotate)}>
          <Rotate size={16} /> Rotate Page
        </button>
        <button className="context-menu-item" role="menuitem" onClick={() => handle(onDuplicate)}>
          <Copy size={16} /> Copy Page
        </button>
        <button className="context-menu-item" role="menuitem" onClick={() => handle(onInsertBlank)}>
          <DocumentBlank size={16} /> Insert Blank Page
        </button>
        <button className="context-menu-item danger" role="menuitem" onClick={() => handle(onDelete)}>
          <TrashCan size={16} /> Delete Page
        </button>
      </div>
    </>
  );
}
