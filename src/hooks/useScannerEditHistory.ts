/** @module useScannerEditHistory — scoped undo/redo/reset for scanner filter & crop parameters */
import { useRef, useState, useEffect, useCallback } from 'react';
import { useScannerStore, type FilterType, type QuadCrop } from '@/stores/scanner';

/** Filter-mode snapshot (filter type + image adjustments) */
interface FilterSnapshot {
  filter: FilterType;
  brightness: number;
  contrast: number;
  shadows: number;
  filterIntensity: number;
  sharpness: number;
  warmth: number;
  saturation: number;
  highlights: number;
  vignette: number;
}

/** Crop-mode snapshot (geometry transforms) */
interface CropSnapshot {
  rotation: number;
  straighten: number;
  crop: QuadCrop | null;
  flipH: boolean;
  flipV: boolean;
  perspectiveH: number;
  perspectiveV: number;
}

const MAX_HISTORY = 20;

function getFilterSnapshot(): FilterSnapshot {
  const s = useScannerStore.getState();
  return {
    filter: s.currentFilter,
    brightness: s.currentBrightness,
    contrast: s.currentContrast,
    shadows: s.currentShadows,
    filterIntensity: s.filterIntensity,
    sharpness: s.currentSharpness,
    warmth: s.currentWarmth,
    saturation: s.currentSaturation,
    highlights: s.currentHighlights,
    vignette: s.currentVignette,
  };
}

function getCropSnapshot(): CropSnapshot {
  const s = useScannerStore.getState();
  return {
    rotation: s.currentRotation,
    straighten: s.currentStraighten,
    crop: s.currentCrop,
    flipH: s.currentFlipH,
    flipV: s.currentFlipV,
    perspectiveH: s.currentPerspectiveH,
    perspectiveV: s.currentPerspectiveV,
  };
}

function restoreFilterSnapshot(snap: FilterSnapshot): void {
  useScannerStore.setState({
    currentFilter: snap.filter,
    currentBrightness: snap.brightness,
    currentContrast: snap.contrast,
    currentShadows: snap.shadows,
    filterIntensity: snap.filterIntensity,
    currentSharpness: snap.sharpness,
    currentWarmth: snap.warmth,
    currentSaturation: snap.saturation,
    currentHighlights: snap.highlights,
    currentVignette: snap.vignette,
  });
}

function restoreCropSnapshot(snap: CropSnapshot): void {
  useScannerStore.setState({
    currentRotation: snap.rotation,
    currentStraighten: snap.straighten,
    currentCrop: snap.crop,
    currentFlipH: snap.flipH,
    currentFlipV: snap.flipV,
    currentPerspectiveH: snap.perspectiveH,
    currentPerspectiveV: snap.perspectiveV,
  });
}

function filterSnapshotsEqual(a: FilterSnapshot, b: FilterSnapshot): boolean {
  return (
    a.filter === b.filter &&
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.shadows === b.shadows &&
    a.filterIntensity === b.filterIntensity &&
    a.sharpness === b.sharpness &&
    a.warmth === b.warmth &&
    a.saturation === b.saturation &&
    a.highlights === b.highlights &&
    a.vignette === b.vignette
  );
}

function cropSnapshotsEqual(a: CropSnapshot, b: CropSnapshot): boolean {
  return (
    a.rotation === b.rotation &&
    a.straighten === b.straighten &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV &&
    a.perspectiveH === b.perspectiveH &&
    a.perspectiveV === b.perspectiveV &&
    JSON.stringify(a.crop) === JSON.stringify(b.crop)
  );
}

interface HistoryScope {
  canUndo: boolean;
  canRedo: boolean;
  canReset: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

function useScopedHistory<T>(
  getSnapshot: () => T,
  restore: (snap: T) => void,
  isEqual: (a: T, b: T) => boolean,
  deps: unknown[],
  currentImage: Blob | null,
  editingPageId: string | null,
): HistoryScope {
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const initialSnapshot = useRef<T | null>(null);
  const lastCommitted = useRef<T | null>(null);
  const restoringRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Reset on new image/page
  useEffect(() => {
    const snap = getSnapshot();
    initialSnapshot.current = snap;
    lastCommitted.current = snap;
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage, editingPageId]);

  // Track changes with debounce
  useEffect(() => {
    if (!currentImage) return;
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const snap = getSnapshot();
      if (!lastCommitted.current || isEqual(snap, lastCommitted.current)) return;

      undoStack.current = [...undoStack.current, lastCommitted.current].slice(-MAX_HISTORY);
      lastCommitted.current = snap;
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, currentImage]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const pendingSnap = getSnapshot();
      if (lastCommitted.current && !isEqual(pendingSnap, lastCommitted.current)) {
        undoStack.current = [...undoStack.current, lastCommitted.current].slice(-MAX_HISTORY);
        lastCommitted.current = pendingSnap;
        redoStack.current = [];
      }
    }
    const current = getSnapshot();
    redoStack.current.push(current);
    const prev = undoStack.current.pop()!;
    restoringRef.current = true;
    restore(prev);
    lastCommitted.current = prev;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const current = getSnapshot();
    undoStack.current.push(current);
    const next = redoStack.current.pop()!;
    restoringRef.current = true;
    restore(next);
    lastCommitted.current = next;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    if (!initialSnapshot.current) return;
    const current = getSnapshot();
    if (isEqual(current, initialSnapshot.current)) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    undoStack.current = [...undoStack.current, current].slice(-MAX_HISTORY);
    redoStack.current = [];
    restoringRef.current = true;
    restore(initialSnapshot.current);
    lastCommitted.current = initialSnapshot.current;
    setCanUndo(true);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canReset = (() => {
    if (!initialSnapshot.current) return false;
    const snap = getSnapshot();
    return !isEqual(snap, initialSnapshot.current);
  })();

  return { canUndo, canRedo, canReset, undo, redo, reset };
}

/** Scoped undo/redo/reset for scanner — returns separate filter and crop histories */
export function useScannerEditHistory() {
  const currentImage = useScannerStore((s) => s.currentImage);
  const editingPageId = useScannerStore((s) => s.editingPageId);

  // Filter-mode dependencies
  const filter = useScannerStore((s) => s.currentFilter);
  const brightness = useScannerStore((s) => s.currentBrightness);
  const contrast = useScannerStore((s) => s.currentContrast);
  const shadows = useScannerStore((s) => s.currentShadows);
  const fIntensity = useScannerStore((s) => s.filterIntensity);
  const sharpness = useScannerStore((s) => s.currentSharpness);
  const warmth = useScannerStore((s) => s.currentWarmth);
  const saturation = useScannerStore((s) => s.currentSaturation);
  const highlights = useScannerStore((s) => s.currentHighlights);
  const vignette = useScannerStore((s) => s.currentVignette);

  // Crop-mode dependencies
  const rotation = useScannerStore((s) => s.currentRotation);
  const straighten = useScannerStore((s) => s.currentStraighten);
  const crop = useScannerStore((s) => s.currentCrop);
  const flipH = useScannerStore((s) => s.currentFlipH);
  const flipV = useScannerStore((s) => s.currentFlipV);
  const perspectiveH = useScannerStore((s) => s.currentPerspectiveH);
  const perspectiveV = useScannerStore((s) => s.currentPerspectiveV);

  const filterHistory = useScopedHistory(
    getFilterSnapshot,
    restoreFilterSnapshot,
    filterSnapshotsEqual,
    [filter, brightness, contrast, shadows, fIntensity, sharpness, warmth, saturation, highlights, vignette],
    currentImage,
    editingPageId,
  );

  const cropHistory = useScopedHistory(
    getCropSnapshot,
    restoreCropSnapshot,
    cropSnapshotsEqual,
    [rotation, straighten, crop, flipH, flipV, perspectiveH, perspectiveV],
    currentImage,
    editingPageId,
  );

  return { filter: filterHistory, crop: cropHistory };
}