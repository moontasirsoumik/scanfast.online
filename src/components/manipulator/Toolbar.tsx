import { Button } from '@carbon/react';
import {
  DocumentAdd,
  CheckboxChecked,
  Rotate,
  Copy,
  DocumentBlank,
  TrashCan,
  SplitScreen,
  Minimize,
  Undo,
  Redo,
  Download,
  Printer,
  Share
} from '@carbon/icons-react';
import './Toolbar.css';

interface ToolbarProps {
  pageCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
  maxPages: number;
  onAdd: () => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onInsertBlank: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onCompress: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onPrint: () => void;
  onShare: () => void;
  onSelectAll: () => void;
}

/** Horizontal toolbar with grouped page operations */
export default function Toolbar({
  pageCount, selectedCount, canUndo, canRedo, isLoading, maxPages,
  onAdd, onRotate, onDuplicate, onInsertBlank, onDelete,
  onSplit, onCompress, onUndo, onRedo, onExport, onPrint, onShare, onSelectAll
}: ToolbarProps) {
  const atPageLimit = pageCount >= maxPages;
  const noSelection = selectedCount === 0;
  const noPages = pageCount === 0;

  return (
    <div className="toolbar" role="toolbar" aria-label="Page operations" aria-orientation="horizontal">
      <div className="toolbar-group">
        <Button kind="ghost" size="sm" renderIcon={DocumentAdd} iconDescription="Add files" disabled={isLoading} onClick={onAdd}>
          Add Files
        </Button>
        <Button kind="ghost" size="sm" renderIcon={CheckboxChecked} iconDescription="Select all" disabled={noPages} onClick={onSelectAll}>
          Select All
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
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <Button kind="ghost" size="sm" renderIcon={Undo} iconDescription="Undo" disabled={!canUndo} onClick={onUndo} hasIconOnly />
        <Button kind="ghost" size="sm" renderIcon={Redo} iconDescription="Redo" disabled={!canRedo} onClick={onRedo} hasIconOnly />
      </div>
      <div className="toolbar-group">
        <Button kind="primary" size="sm" renderIcon={Download} disabled={noPages || isLoading} onClick={onExport}>
          Save PDF
        </Button>
        <Button kind="ghost" size="sm" renderIcon={Printer} iconDescription="Print" disabled={noPages || isLoading} onClick={onPrint}>
          Print
        </Button>
        <Button kind="ghost" size="sm" renderIcon={Share} iconDescription="Share" disabled={noPages || isLoading} onClick={onShare}>
          Share
        </Button>
      </div>
    </div>
  );
}
