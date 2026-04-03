import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@carbon/react';
import type { PageData } from '@/services/pdf';
import './CompressDialog.css';

interface CompressDialogProps {
  pages: PageData[];
  selectedIds: Set<string>;
  open: boolean;
  onClose: () => void;
  onCompress: (quality: number) => void;
}

/** Format byte count to human-readable string */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Custom modal for compressing pages with JPEG quality slider */
export default function CompressDialog({ pages, selectedIds, open, onClose, onCompress }: CompressDialogProps) {
  const [quality, setQuality] = useState(75);

  useEffect(() => {
    if (open) setQuality(75);
  }, [open]);

  const selectedPages = useMemo(() => pages.filter(p => selectedIds.has(p.id)), [pages, selectedIds]);
  const selectedCount = selectedPages.length;

  const originalSize = useMemo(
    () => selectedPages.reduce((sum, p) => sum + p.data.byteLength, 0),
    [selectedPages]
  );

  const estimatedSize = Math.round(originalSize * (quality / 100) * 0.8);
  const savingsPercent = originalSize > 0
    ? Math.round(((originalSize - estimatedSize) / originalSize) * 100)
    : 0;

  const handleCompress = useCallback(() => {
    if (selectedCount === 0) return;
    onCompress(quality / 100);
  }, [selectedCount, quality, onCompress]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleKeydown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="compress-backdrop"
      role="dialog"
      aria-modal={true}
      aria-label="Compress Pages"
      tabIndex={-1}
      onClick={handleBackdropClick}
      onKeyDown={handleKeydown}
    >
      <div className="compress-modal">
        <header className="compress-header">
          <h2>Compress Pages</h2>
          <p className="compress-desc">Re-renders selected pages as JPEG at the chosen quality level.</p>
        </header>

        <div className="compress-body">
          <div className="quality-control">
            <label className="quality-label" htmlFor="quality-slider">
              JPEG Quality: <strong>{quality}%</strong>
            </label>
            <input
              id="quality-slider"
              type="range"
              min={50}
              max={95}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="quality-slider"
            />
            <div className="quality-range">
              <span>50% (smaller)</span>
              <span>95% (higher quality)</span>
            </div>
          </div>

          <div className="size-info">
            <div className="size-row">
              <span className="size-label">Original</span>
              <span className="size-value">~{formatBytes(originalSize)}</span>
            </div>
            <div className="size-row">
              <span className="size-label">Estimated</span>
              <span className="size-value estimated">~{formatBytes(estimatedSize)}</span>
            </div>
            <div className="size-row savings">
              <span className="size-label">Savings</span>
              <span className="size-value savings-value">~{savingsPercent}%</span>
            </div>
          </div>

          <p className="compress-note">
            {selectedCount} page{selectedCount !== 1 ? 's' : ''} selected.
            Works best on scanned/image-heavy PDFs.
          </p>
        </div>

        <footer className="compress-footer">
          <Button kind="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="sm" disabled={selectedCount === 0} onClick={handleCompress}>Compress</Button>
        </footer>
      </div>
    </div>
  );
}
