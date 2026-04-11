import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { WatsonHealthTextAnnotationToggle } from '@carbon/icons-react';
import type { WatermarkOptions } from '@/services/pdf';
import './WatermarkDialog.css';

interface WatermarkDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (options: WatermarkOptions) => void;
}

const COLOR_OPTIONS = [
  { id: 'gray', label: 'Gray', r: 0.5, g: 0.5, b: 0.5, hex: '#808080' },
  { id: 'red', label: 'Red', r: 0.8, g: 0.1, b: 0.1, hex: '#cc1a1a' },
  { id: 'blue', label: 'Blue', r: 0.1, g: 0.2, b: 0.8, hex: '#1a33cc' },
  { id: 'black', label: 'Black', r: 0, g: 0, b: 0, hex: '#000000' },
];

/** Custom modal for adding a text watermark to all pages */
export default function WatermarkDialog({ open, onClose, onApply }: WatermarkDialogProps) {
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(15);
  const [rotation, setRotation] = useState(-30);
  const [colorId, setColorId] = useState('gray');

  useEffect(() => {
    if (open) {
      setText('CONFIDENTIAL');
      setFontSize(48);
      setOpacity(15);
      setRotation(-30);
      setColorId('gray');
    }
  }, [open]);

  const selectedColor = useMemo(() => COLOR_OPTIONS.find((c) => c.id === colorId) ?? COLOR_OPTIONS[0], [colorId]);

  const handleApply = useCallback(() => {
    if (!text.trim()) return;
    onApply({
      text: text.trim(),
      fontSize,
      opacity: opacity / 100,
      rotation,
      color: { r: selectedColor.r, g: selectedColor.g, b: selectedColor.b },
    });
  }, [text, fontSize, opacity, rotation, selectedColor, onApply]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const previewStyle: React.CSSProperties = {
    fontSize: `${Math.min(fontSize, 32)}px`,
    color: `rgba(${Math.round(selectedColor.r * 255)}, ${Math.round(selectedColor.g * 255)}, ${Math.round(selectedColor.b * 255)}, ${opacity / 100})`,
    transform: `rotate(${rotation}deg)`,
  };

  if (!open) return null;

  return (
    <div className="watermark-backdrop" onClick={handleBackdropClick}>
      <div className="watermark-modal" role="dialog" aria-modal aria-label="Add Watermark">
        <header className="watermark-header">
          <h2>Add Watermark</h2>
          <p className="watermark-desc">Apply a text watermark to every page.</p>
        </header>

        <div className="watermark-body">
          <div className="watermark-preview-box">
            <span className="watermark-preview-text" style={previewStyle}>
              {text || 'Preview'}
            </span>
          </div>

          <div className="watermark-field">
            <label htmlFor="wm-text">Text</label>
            <input
              id="wm-text"
              type="text"
              value={text}
              maxLength={60}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="watermark-field">
            <label>Font Size</label>
            <div className="watermark-range-row">
              <input type="range" min={12} max={120} step={2} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              <span className="watermark-range-value">{fontSize}px</span>
            </div>
          </div>

          <div className="watermark-field">
            <label>Opacity</label>
            <div className="watermark-range-row">
              <input type="range" min={5} max={50} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              <span className="watermark-range-value">{opacity}%</span>
            </div>
          </div>

          <div className="watermark-field">
            <label>Rotation</label>
            <div className="watermark-range-row">
              <input type="range" min={-90} max={90} step={5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
              <span className="watermark-range-value">{rotation}°</span>
            </div>
          </div>

          <div className="watermark-field">
            <label>Color</label>
            <div className="watermark-color-row">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  className={`watermark-color-chip${colorId === c.id ? ' active' : ''}`}
                  style={{ background: c.hex }}
                  title={c.label}
                  onClick={() => setColorId(c.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="watermark-footer">
          <Button kind="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="sm" disabled={!text.trim()} onClick={handleApply} renderIcon={WatsonHealthTextAnnotationToggle}>Apply</Button>
        </footer>
      </div>
    </div>
  );
}
