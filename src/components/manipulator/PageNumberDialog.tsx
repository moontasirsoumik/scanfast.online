import { useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { ListNumbered } from '@carbon/icons-react';
import type { PageNumberPosition, PageNumberOptions } from '@/services/pdf';
import './PageNumberDialog.css';

interface PageNumberDialogProps {
  open: boolean;
  pageCount: number;
  onClose: () => void;
  onApply: (options: PageNumberOptions) => void;
}

const POSITION_OPTIONS: { id: PageNumberPosition; text: string }[] = [
  { id: 'bottom-center', text: 'Bottom Center' },
  { id: 'bottom-left', text: 'Bottom Left' },
  { id: 'bottom-right', text: 'Bottom Right' },
  { id: 'top-center', text: 'Top Center' },
  { id: 'top-left', text: 'Top Left' },
  { id: 'top-right', text: 'Top Right' },
];

/** Custom modal for adding page numbers to the PDF */
export default function PageNumberDialog({ open, pageCount, onClose, onApply }: PageNumberDialogProps) {
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');
  const [fontSize, setFontSize] = useState(12);
  const [startNumber, setStartNumber] = useState(1);
  const [prefix, setPrefix] = useState('');

  useEffect(() => {
    if (open) {
      setPosition('bottom-center');
      setFontSize(12);
      setStartNumber(1);
      setPrefix('');
    }
  }, [open]);

  const handleApply = useCallback(() => {
    onApply({ position, fontSize, startNumber, prefix });
  }, [position, fontSize, startNumber, prefix, onApply]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const exampleLabel = `${prefix}${startNumber}`;

  if (!open) return null;

  return (
    <div className="page-number-backdrop" onClick={handleBackdropClick}>
      <div className="page-number-modal" role="dialog" aria-modal aria-label="Add Page Numbers">
        <header className="page-number-header">
          <h2>Add Page Numbers</h2>
          <p className="page-number-desc">Number every page in the PDF.</p>
        </header>

        <div className="page-number-body">
          <div className="page-number-preview-bar">
            Preview: {exampleLabel} … {prefix}{startNumber + Math.max(pageCount - 1, 0)}
          </div>

          <div className="page-number-field">
            <label htmlFor="pn-position">Position</label>
            <select
              id="pn-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as PageNumberPosition)}
            >
              {POSITION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.text}</option>
              ))}
            </select>
          </div>

          <div className="page-number-field">
            <label htmlFor="pn-fontsize">Font Size</label>
            <input
              id="pn-fontsize"
              type="number"
              min={8}
              max={36}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </div>

          <div className="page-number-field">
            <label htmlFor="pn-start">Start Number</label>
            <input
              id="pn-start"
              type="number"
              min={0}
              max={9999}
              step={1}
              value={startNumber}
              onChange={(e) => setStartNumber(Number(e.target.value))}
            />
          </div>

          <div className="page-number-field">
            <label htmlFor="pn-prefix">Prefix (optional)</label>
            <input
              id="pn-prefix"
              type="text"
              value={prefix}
              placeholder="e.g. Page "
              maxLength={20}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </div>
        </div>

        <footer className="page-number-footer">
          <Button kind="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="sm" onClick={handleApply} renderIcon={ListNumbered}>Add Numbers</Button>
        </footer>
      </div>
    </div>
  );
}
