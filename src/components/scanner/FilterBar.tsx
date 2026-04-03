import { useState, useEffect } from 'react';
import type { FilterType } from '@/stores/scanner';
import { applyFilter } from '@/services/filters';
import './FilterBar.css';

interface FilterBarProps {
  sourceBlob: Blob;
  activeFilter: FilterType;
  onSelect: (filter: FilterType) => void;
}

const FILTERS: { type: FilterType; label: string }[] = [
  { type: 'original', label: 'Original' },
  { type: 'enhance', label: 'Enhance' },
  { type: 'bw', label: 'B&W' },
  { type: 'grayscale', label: 'Gray' },
  { type: 'sharpen', label: 'Sharpen' },
  { type: 'color', label: 'Color' }
];

/** Resize blob to a small version for preview generation */
async function createSmallBlob(blob: Blob): Promise<Blob> {
  const img = await createImageBitmap(blob);
  const maxSize = 64;
  const scale = maxSize / Math.max(img.width, img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
}

/** Horizontal filter bar with thumbnail previews and radio-group semantics */
export default function FilterBar({ sourceBlob, activeFilter, onSelect }: FilterBarProps) {
  const [previews, setPreviews] = useState<Map<FilterType, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sourceBlob) return;
    let cancelled = false;

    async function generatePreviews() {
      setLoading(true);
      try {
        const smallBlob = await createSmallBlob(sourceBlob);
        const results = await Promise.all(
          FILTERS.map(async (f) => {
            const dataUrl = await applyFilter(smallBlob, f.type);
            return [f.type, dataUrl] as const;
          })
        );
        if (cancelled) return;
        const map = new Map<FilterType, string>();
        for (const [type, url] of results) {
          map.set(type, url);
        }
        setPreviews(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generatePreviews();
    return () => { cancelled = true; };
  }, [sourceBlob]);

  return (
    <div className="filter-bar" role="radiogroup" aria-label="Image filters">
      {FILTERS.map((f) => (
        <button
          key={f.type}
          className={`filter-card${activeFilter === f.type ? ' active' : ''}`}
          onClick={() => onSelect(f.type)}
          role="radio"
          aria-checked={activeFilter === f.type}
          aria-label={f.label}
        >
          <div className="preview-box">
            {loading || !previews.has(f.type) ? (
              <div className="skeleton" />
            ) : (
              <img src={previews.get(f.type)} alt={f.label} className="preview-img" />
            )}
          </div>
          <span className="filter-label">{f.label}</span>
        </button>
      ))}
    </div>
  );
}
