import { useState, useRef, useCallback } from 'react';
import { DocumentAdd } from '@carbon/icons-react';
import './DropZone.css';

interface DropZoneProps {
  maxPages: number;
  onFiles: (files: File[]) => void;
}

/** Drop zone with drag-over highlighting and file picker for PDF + images */
export default function DropZone({ maxPages, onFiles }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer?.files) return;
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    onFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [onFiles]);

  const openPicker = useCallback(() => {
    fileInput.current?.click();
  }, []);

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        multiple
        hidden
        onChange={handleFileInput}
      />
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPicker(); }}
      >
        <div className="drop-zone-content">
          <DocumentAdd size={48} />
          <p className="drop-label">Drop PDF or image files here, or click to browse</p>
          <span className="drop-hint">Supported: PDF, JPEG, PNG, WebP</span>
          <span className="drop-hint-small">Up to {maxPages} pages per session — all processing happens in your browser</span>
        </div>
      </div>
    </>
  );
}
