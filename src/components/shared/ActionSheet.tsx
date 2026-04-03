import { useEffect } from 'react';
import './ActionSheet.css';

interface ActionSheetOption {
  id: string;
  label: string;
  description?: string;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  options: ActionSheetOption[];
}

/** Bottom-sheet style action picker for compact secondary workflows. */
export default function ActionSheet({ open, title, onClose, options }: ActionSheetProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="action-sheet-root" role="presentation">
      <button className="action-sheet-backdrop" aria-label="Close actions" onClick={onClose} />
      <div className="action-sheet" role="dialog" aria-modal={true} aria-label={title}>
        <div className="action-sheet-handle" />
        <div className="action-sheet-header">
          <h2>{title}</h2>
          <button className="action-sheet-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="action-sheet-options">
          {options.map((option) => (
            <button
              key={option.id}
              className={`action-sheet-option${option.tone === 'danger' ? ' danger' : ''}`}
              onClick={() => {
                option.onSelect();
                onClose();
              }}
            >
              <span className="action-sheet-label">{option.label}</span>
              {option.description ? <span className="action-sheet-description">{option.description}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}