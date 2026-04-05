import { useState, useEffect, useCallback, useRef } from 'react';
import { Loading } from '@carbon/react';
import { Close, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import { exportPageAsImage, type PageData } from '@/services/pdf';
import useIsMobile from '@/hooks/useIsMobile';
import './PagePreview.css';

interface PagePreviewProps {
  pages: PageData[];
  initialIndex: number;
  onClose: () => void;
}

export default function PagePreview({ pages, initialIndex, onClose }: PagePreviewProps) {
  const isMobile = useIsMobile();
  const [index, setIndex] = useState(initialIndex);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [transition, setTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');

  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ startX: number } | null>(null);
  const wasPinchRef = useRef(false);
  const prevUrlRef = useRef<string | null>(null);

  const safeIndex = Math.min(index, pages.length - 1);
  if (safeIndex !== index) {
    setIndex(safeIndex);
  }

  const page = pages[safeIndex];

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    setLoading(true);

    exportPageAsImage(page, 'jpeg', 0.92, 2000).then((blob) => {
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
      prevUrlRef.current = url;
      setImageUrl(url);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [page]);

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, []);

  const goTo = useCallback((newIndex: number, dir: 'left' | 'right') => {
    if (newIndex < 0 || newIndex >= pages.length) return;
    setTransition(dir === 'left' ? 'slide-left' : 'slide-right');
    setZoom(1.0);
    setTimeout(() => {
      setIndex(newIndex);
      setTransition('none');
    }, 250);
  }, [pages.length]);

  const goPrev = useCallback(() => {
    goTo(safeIndex - 1, 'right');
  }, [goTo, safeIndex]);

  const goNext = useCallback(() => {
    goTo(safeIndex + 1, 'left');
  }, [goTo, safeIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'ArrowRight') {
        goNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      return Math.min(5.0, Math.max(0.5, prev + step));
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: zoom };
      wasPinchRef.current = true;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setZoom(1.0);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
      swipeRef.current = { startX: e.touches[0].clientX };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5.0, Math.max(0.5, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setZoom(newScale);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeRef.current && !wasPinchRef.current && e.changedTouches.length === 1 && zoom <= 1.0) {
      const endX = e.changedTouches[0].clientX;
      const delta = endX - swipeRef.current.startX;
      if (Math.abs(delta) > 80) {
        if (delta > 0) {
          goTo(safeIndex - 1, 'right');
        } else {
          goTo(safeIndex + 1, 'left');
        }
      }
    }
    pinchRef.current = null;
    swipeRef.current = null;
    wasPinchRef.current = false;
  }, [zoom, safeIndex, goTo]);

  if (!page) return null;

  const imgClasses = [
    'page-preview-img',
    zoom !== 1 ? 'zoomed' : '',
    transition !== 'none' ? transition : ''
  ].filter(Boolean).join(' ');

  return (
    <div className="page-preview-overlay">
      <div className="page-preview-header">
        <span className="page-preview-counter">
          {safeIndex + 1} / {pages.length}
        </span>
        <button
          className="page-preview-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <Close size={20} />
        </button>
      </div>

      <div
        className="page-preview-body"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {loading && (
          <div className="page-preview-loading">
            <Loading withOverlay={false} small />
          </div>
        )}

        {imageUrl && (
          <img
            src={imageUrl}
            alt={`Page ${safeIndex + 1}`}
            className={imgClasses}
            style={{
              transform: `scale(${zoom})`,
              '--_scale': zoom
            } as React.CSSProperties}
            draggable={false}
          />
        )}

        {!isMobile && safeIndex > 0 && (
          <button
            className="page-preview-nav page-preview-nav--prev"
            onClick={goPrev}
            aria-label="Previous page"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {!isMobile && safeIndex < pages.length - 1 && (
          <button
            className="page-preview-nav page-preview-nav--next"
            onClick={goNext}
            aria-label="Next page"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
