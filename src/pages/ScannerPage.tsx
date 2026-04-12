import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loading, Tag } from '@carbon/react';
import { Scan, Image as ImageIcon, DocumentPdf, Add, Crop, ArrowLeft, ArrowRight, Download, ChevronLeft, ChevronRight, Close, SettingsAdjust, Undo, Redo, Reset } from '@carbon/icons-react';
import { useScannerStore, MAX_PAGES, type QuadCrop, type FilterType, type ScannedPage, type ImageAdjustments } from '@/stores/scanner';
import { useManipulatorStore } from '@/stores/manipulator';
import { addToast } from '@/stores/toast';
import { processPage, readExifOrientation, exifOrientationToDegrees, downscaleBlob } from '@/services/filters';
import { detectDocumentFromBlob } from '@/services/documentDetection';
import { downloadBlob, loadFiles } from '@/services/pdf';
import CameraView from '@/components/scanner/CameraView';
import CropEditor from '@/components/scanner/CropEditor';
import FilterBar from '@/components/scanner/FilterBar';
import AdjustmentBar from '@/components/scanner/AdjustmentBar';
import PageGallery from '@/components/scanner/PageGallery';
import ActionSheet from '@/components/shared/ActionSheet';
import useIsMobile from '@/hooks/useIsMobile';
import { useScannerEditHistory } from '@/hooks/useScannerEditHistory';
import './ScannerPage.css';

function clampPreviewScale(scale: number): number {
  return Math.min(5, Math.max(1, scale));
}

/** Scanner page — capture, crop, filter, and manage scanned pages */
export default function ScannerPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { filter: filterHistory, crop: cropHistory } = useScannerEditHistory();
  const [previewUrl, setPreviewUrl] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState<QuadCrop | null>(null);
  const [cropBaseUrl, setCropBaseUrl] = useState('');
  const [previewScale, setPreviewScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [transition, setTransition] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ startX: number } | null>(null);
  const wasPinchRef = useRef(false);
  const pendingEnterRef = useRef('');
  const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const mousePanRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const view = useScannerStore((s) => s.view);
  const pages = useScannerStore((s) => s.pages);
  const currentImage = useScannerStore((s) => s.currentImage);
  const currentFilter = useScannerStore((s) => s.currentFilter);
  const currentRotation = useScannerStore((s) => s.currentRotation);
  const currentStraighten = useScannerStore((s) => s.currentStraighten);
  const currentCrop = useScannerStore((s) => s.currentCrop);
  const isProcessing = useScannerStore((s) => s.isProcessing);
  const editingPageId = useScannerStore((s) => s.editingPageId);
  const setView = useScannerStore((s) => s.setView);
  const captureImage = useScannerStore((s) => s.captureImage);
  const setFilter = useScannerStore((s) => s.setFilter);
  const setRotation = useScannerStore((s) => s.setRotation);
  const setStraighten = useScannerStore((s) => s.setStraighten);
  const setCrop = useScannerStore((s) => s.setCrop);
  const setProcessing = useScannerStore((s) => s.setProcessing);
  const savePage = useScannerStore((s) => s.savePage);
  const editPage = useScannerStore((s) => s.editPage);
  const removePage = useScannerStore((s) => s.removePage);
  const resetPreview = useScannerStore((s) => s.resetPreview);
  const addPages = useScannerStore((s) => s.addPages);
  const currentFlipH = useScannerStore((s) => s.currentFlipH);
  const currentFlipV = useScannerStore((s) => s.currentFlipV);
  const currentPerspectiveH = useScannerStore((s) => s.currentPerspectiveH);
  const currentPerspectiveV = useScannerStore((s) => s.currentPerspectiveV);
  const currentBrightness = useScannerStore((s) => s.currentBrightness);
  const currentContrast = useScannerStore((s) => s.currentContrast);
  const currentShadows = useScannerStore((s) => s.currentShadows);
  const filterIntensity = useScannerStore((s) => s.filterIntensity);
  const currentSharpness = useScannerStore((s) => s.currentSharpness);
  const currentWarmth = useScannerStore((s) => s.currentWarmth);
  const currentSaturation = useScannerStore((s) => s.currentSaturation);
  const currentHighlights = useScannerStore((s) => s.currentHighlights);
  const currentVignette = useScannerStore((s) => s.currentVignette);
  const setFlipH = useScannerStore((s) => s.setFlipH);
  const setFlipV = useScannerStore((s) => s.setFlipV);
  const setPerspectiveH = useScannerStore((s) => s.setPerspectiveH);
  const setPerspectiveV = useScannerStore((s) => s.setPerspectiveV);
  const setBrightness = useScannerStore((s) => s.setBrightness);
  const setContrast = useScannerStore((s) => s.setContrast);
  const setShadows = useScannerStore((s) => s.setShadows);
  const setFilterIntensity = useScannerStore((s) => s.setFilterIntensity);
  const setSharpness = useScannerStore((s) => s.setSharpness);
  const setWarmth = useScannerStore((s) => s.setWarmth);
  const setSaturation = useScannerStore((s) => s.setSaturation);
  const setHighlights = useScannerStore((s) => s.setHighlights);
  const setVignette = useScannerStore((s) => s.setVignette);

  /** Build the current ImageAdjustments object */
  const currentAdjustments: ImageAdjustments = {
    flipH: currentFlipH,
    flipV: currentFlipV,
    perspectiveH: currentPerspectiveH,
    perspectiveV: currentPerspectiveV,
    brightness: currentBrightness,
    contrast: currentContrast,
    shadows: currentShadows,
    filterIntensity,
    sharpness: currentSharpness,
    warmth: currentWarmth,
    saturation: currentSaturation,
    highlights: currentHighlights,
    vignette: currentVignette,
  };

  useEffect(() => {
    document.title = 'Scanner — ScanFastOnline';
  }, []);

  // --- Live preview processing ---
  useEffect(() => {
    if (!currentImage) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    setProcessing(true);
    processPage(currentImage, currentFilter, currentRotation, currentCrop, currentStraighten, currentAdjustments)
      .then((result) => {
        if (!cancelled) {
          setPreviewUrl(result.dataUrl);
          setProcessing(false);
          if (pendingEnterRef.current) {
            setTransition(pendingEnterRef.current);
            pendingEnterRef.current = '';
            setTimeout(() => setTransition(''), 200);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProcessing(false);
          pendingEnterRef.current = '';
          addToast({ kind: 'error', title: 'Preview failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
        }
      });
    return () => { cancelled = true; };
  }, [currentImage, currentFilter, currentRotation, currentCrop, currentStraighten, currentFlipH, currentFlipV, currentPerspectiveH, currentPerspectiveV, currentBrightness, currentContrast, currentShadows, filterIntensity, currentSharpness, currentWarmth, currentSaturation, currentHighlights, currentVignette, setProcessing]);

  // Generate crop-base image (filter + rotation + straighten + flip/perspective, but NO crop)
  // so CropEditor shows the image with all current effects applied
  useEffect(() => {
    if (!currentImage) {
      setCropBaseUrl('');
      return;
    }
    let cancelled = false;
    const adj = { ...currentAdjustments };
    processPage(currentImage, currentFilter, currentRotation, null, currentStraighten, adj)
      .then((result) => {
        if (!cancelled) setCropBaseUrl(result.dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setCropBaseUrl('');
        }
      });
    return () => { cancelled = true; };
  }, [currentImage, currentFilter, currentRotation, currentStraighten, currentFlipH, currentFlipV, currentPerspectiveH, currentPerspectiveV]);

  useEffect(() => {
    if (!cropMode) {
      setDraftCrop(currentCrop);
    }
  }, [cropMode, currentCrop, currentImage, editingPageId]);

  // --- Handlers ---
  const handleCapture = useCallback(async (blob: Blob, detectedQuad?: QuadCrop | null) => {
    // Batch mode: save directly with default settings, stay on camera
    const state = useScannerStore.getState();
    if (state.pages.length >= MAX_PAGES) {
      addToast({ kind: 'warning', title: 'Page limit reached', subtitle: `Maximum ${MAX_PAGES} pages per session.` });
      return;
    }
    try {
      const scaled = await downscaleBlob(blob);
      const orientation = await readExifOrientation(scaled);
      const degrees = exifOrientationToDegrees(orientation);

      // Use live-detected quad directly when provided (already good quality from stabilized live detection).
      // Only run HQ detection for gallery imports (detectedQuad === undefined) where we have no live result.
      // detectedQuad === null means user had auto-crop off; undefined means gallery import.
      let cropQuad: QuadCrop | null = null;
      if (detectedQuad === undefined) {
        // Gallery import — no live quad, run detection now
        cropQuad = await detectDocumentFromBlob(scaled);
      } else if (detectedQuad !== null) {
        // Live capture with auto-crop — trust the stabilized live quad directly
        cropQuad = detectedQuad;
      }

      const result = await processPage(scaled, 'original', degrees, cropQuad, 0);
      const page: ScannedPage = {
        id: crypto.randomUUID(),
        originalBlob: scaled,
        processedDataUrl: result.dataUrl,
        thumbnail: result.thumbnail,
        filter: 'original',
        rotation: degrees,
        straighten: 0,
        cropRect: cropQuad,
        flipH: false,
        flipV: false,
        perspectiveH: 0,
        perspectiveV: 0,
        brightness: 0,
        contrast: 0,
        shadows: 0,
        filterIntensity: 100,
        sharpness: 0,
        warmth: 0,
        saturation: 0,
        highlights: 0,
        vignette: 0
      };
      const added = useScannerStore.getState().addPage(page);
      if (added) {
        // Visual feedback handled by fly-to-done animation in CameraView
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Capture failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, []);

  const handleCameraClose = useCallback(() => {
    const state = useScannerStore.getState();
    setView(state.pages.length > 0 ? 'gallery' : 'idle');
  }, [setView]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    if (fileList.length === 0) return;
    e.target.value = '';

    if (fileList.length === 1) {
      // Single file → go to preview for editing, detect document edges for initial crop
      const scaled = await downscaleBlob(fileList[0]);
      captureImage(scaled);
      const orientation = await readExifOrientation(scaled);
      const degrees = exifOrientationToDegrees(orientation);
      if (degrees !== 0) {
        setRotation(degrees);
      }
      // Don't auto-crop on import — user can use the crop editor's auto-crop button
      return;
    }

    // Multiple files â†’ batch import with default settings, go to gallery
    setProcessing(true);
    try {
      const newPages: ScannedPage[] = [];
      const state = useScannerStore.getState();
      const remaining = MAX_PAGES - state.pages.length;
      const toProcess = fileList.slice(0, remaining);

      for (const file of toProcess) {
        const scaled = await downscaleBlob(file);
        const orientation = await readExifOrientation(scaled);
        const degrees = exifOrientationToDegrees(orientation);
        const cropQuad = await detectDocumentFromBlob(scaled);
        const result = await processPage(scaled, 'original', degrees, cropQuad, 0);
        newPages.push({
          id: crypto.randomUUID(),
          originalBlob: scaled,
          processedDataUrl: result.dataUrl,
          thumbnail: result.thumbnail,
          filter: 'original',
          rotation: degrees,
          straighten: 0,
          cropRect: cropQuad,
          flipH: false,
          flipV: false,
          perspectiveH: 0,
          perspectiveV: 0,
          brightness: 0,
          contrast: 0,
          shadows: 0,
          filterIntensity: 100,
          sharpness: 0,
          warmth: 0,
          saturation: 0,
          highlights: 0,
          vignette: 0
        });
      }

      if (newPages.length > 0) {
        addPages(newPages);
        addToast({ kind: 'success', title: `${newPages.length} images imported`, subtitle: 'Tap any page to edit.' });
        setView('gallery');
      }

      if (fileList.length > remaining) {
        addToast({ kind: 'warning', title: 'Page limit reached', subtitle: `Only imported ${remaining} of ${fileList.length} images.` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Import failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [captureImage, setRotation, addPages, setView, setProcessing]);

  const handleSavePage = useCallback(async () => {
    const state = useScannerStore.getState();
    if (!state.currentImage) return;
    if (!state.editingPageId && state.pages.length >= MAX_PAGES) {
      addToast({ kind: 'warning', title: 'Page limit reached', subtitle: `Maximum ${MAX_PAGES} pages per session.` });
      return;
    }
    setProcessing(true);
    try {
      const adj: ImageAdjustments = {
        flipH: state.currentFlipH,
        flipV: state.currentFlipV,
        perspectiveH: state.currentPerspectiveH,
        perspectiveV: state.currentPerspectiveV,
        brightness: state.currentBrightness,
        contrast: state.currentContrast,
        shadows: state.currentShadows,
        filterIntensity: state.filterIntensity,
        sharpness: state.currentSharpness,
        warmth: state.currentWarmth,
        saturation: state.currentSaturation,
        highlights: state.currentHighlights,
        vignette: state.currentVignette,
      };
      const result = await processPage(
        state.currentImage,
        state.currentFilter,
        state.currentRotation,
        state.currentCrop,
        state.currentStraighten,
        adj
      );
      savePage(result.dataUrl, result.thumbnail);
      setCropMode(false);
    } catch (err) {
      addToast({ kind: 'error', title: 'Failed to save page', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [setProcessing, savePage]);

  const handlePreviewClose = useCallback(() => {
    setCropMode(false);
    setDraftCrop(null);
    setPreviewScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    setTransition('');
    pendingEnterRef.current = '';
    resetPreview();
    const state = useScannerStore.getState();
    setView(state.pages.length > 0 ? 'gallery' : 'idle');
  }, [resetPreview, setView]);

  const handleRetake = useCallback(() => {
    handlePreviewClose();
  }, [handlePreviewClose]);

  const handleToggleCrop = useCallback(() => {
    if (cropMode) {
      // Leaving crop mode → auto-confirm the crop
      setCrop(draftCrop);
      setCropMode(false);
    } else {
      // Entering crop mode
      setDraftCrop(currentCrop);
      setCropMode(true);
    }
  }, [cropMode, currentCrop, draftCrop, setCrop]);

  const handleCropConfirm = useCallback(() => {
    setCrop(draftCrop);
    setCropMode(false);
  }, [draftCrop, setCrop]);

  const handleCropCancel = useCallback(() => {
    setDraftCrop(currentCrop);
    setCropMode(false);
  }, [currentCrop]);

  const applyCropTransform = useCallback((transform: (quad: QuadCrop) => QuadCrop) => {
    const sourceCrop = draftCrop ?? useScannerStore.getState().currentCrop;
    if (!sourceCrop) return;

    const nextCrop = transform(sourceCrop);
    setCrop(nextCrop);
    setDraftCrop(nextCrop);
  }, [draftCrop, setCrop]);

  /** Rotate crop quad to match new image rotation */
  const handleRotate = useCallback((newDeg: number) => {
    const oldDeg = useScannerStore.getState().currentRotation;
    setRotation(newDeg);

    const delta = ((newDeg - oldDeg) % 360 + 360) % 360;
    if (delta === 0) return;

    const rotatePt = (p: { x: number; y: number }, steps: number) => {
      let { x, y } = p;
      for (let i = 0; i < steps; i++) {
        const nx = 1 - y;
        const ny = x;
        x = nx;
        y = ny;
      }
      return { x, y };
    };

    const steps = delta === 90 ? 1 : delta === 180 ? 2 : delta === 270 ? 3 : 0;
    if (steps === 0) return;

    // Relabel corners so labels match their new visual position after rotation.
    // 90° CW: old bl→new tl, old tl→new tr, old tr→new br, old br→new bl
    const transformQuad = (q: QuadCrop): QuadCrop => {
      if (steps === 1) return { tl: rotatePt(q.bl, 1), tr: rotatePt(q.tl, 1), br: rotatePt(q.tr, 1), bl: rotatePt(q.br, 1) };
      if (steps === 2) return { tl: rotatePt(q.br, 2), tr: rotatePt(q.bl, 2), br: rotatePt(q.tl, 2), bl: rotatePt(q.tr, 2) };
      return { tl: rotatePt(q.tr, 3), tr: rotatePt(q.br, 3), br: rotatePt(q.bl, 3), bl: rotatePt(q.tl, 3) };
    };

    applyCropTransform(transformQuad);
  }, [applyCropTransform, setRotation]);

  const handleEditPage = useCallback((id: string) => {
    setPreviewScale(1.0);
    editPage(id);
  }, [editPage]);

  const handleDeletePage = useCallback((id: string) => {
    removePage(id);
    const state = useScannerStore.getState();
    if (state.pages.length === 0) {
      setView('idle');
    }
  }, [removePage, setView]);

  const handleExport = useCallback(async () => {
    const state = useScannerStore.getState();
    if (state.pages.length === 0) return;
    setProcessing(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();

      for (const page of state.pages) {
        const resp = await fetch(page.processedDataUrl);
        const blob = await resp.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());

        let image;
        if (page.processedDataUrl.startsWith('data:image/png')) {
          image = await pdfDoc.embedPng(bytes);
        } else {
          image = await pdfDoc.embedJpg(bytes);
        }
        const pdfPage = pdfDoc.addPage([image.width, image.height]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      downloadBlob(pdfBlob, 'scanfast-scan.pdf');
      addToast({ kind: 'success', title: 'PDF exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [setProcessing]);

  const handleExportImages = useCallback(async () => {
    const state = useScannerStore.getState();
    if (state.pages.length === 0) return;
    setProcessing(true);
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const page = state.pages[i];
        const resp = await fetch(page.processedDataUrl);
        const blob = await resp.blob();
        downloadBlob(blob, `scanfast-page-${i + 1}.jpg`);
      }
      if (state.pages.length >= 3) {
        addToast({ kind: 'success', title: 'Images exported', subtitle: `${state.pages.length} images downloaded.` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [setProcessing]);

  const handleShare = useCallback(async () => {
    const state = useScannerStore.getState();
    if (state.pages.length === 0) return;
    setProcessing(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();

      for (const page of state.pages) {
        const resp = await fetch(page.processedDataUrl);
        const blob = await resp.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let image;
        if (page.processedDataUrl.startsWith('data:image/png')) {
          image = await pdfDoc.embedPng(bytes);
        } else {
          image = await pdfDoc.embedJpg(bytes);
        }
        const pdfPage = pdfDoc.addPage([image.width, image.height]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const file = new File([blob], 'scanfast-scan.pdf', { type: 'application/pdf' });
      const shareData = { files: [file], title: 'ScanFast Scan' };

      if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        addToast({ kind: 'success', title: 'Shared', subtitle: 'PDF shared successfully.' });
      } else {
        downloadBlob(blob, 'scanfast-scan.pdf');
        addToast({ kind: 'info', title: 'Sharing not supported', subtitle: 'PDF downloaded instead.' });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      addToast({ kind: 'error', title: 'Share failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [setProcessing]);

  const handleOpenManipulator = useCallback(async () => {
    const state = useScannerStore.getState();
    if (state.pages.length === 0) return;
    setProcessing(true);
    try {
      const files: File[] = [];
      for (const page of state.pages) {
        const resp = await fetch(page.processedDataUrl);
        const blob = await resp.blob();
        files.push(new File([blob], `scan-${page.id}.jpg`, { type: 'image/jpeg' }));
      }

      useManipulatorStore.getState().setLoading(true);
      const pageData = await loadFiles(files, 20, 0);
      useManipulatorStore.getState().addPages(pageData);
      useManipulatorStore.getState().setLoading(false);

      navigate('/manipulator');
    } finally {
      setProcessing(false);
    }
  }, [setProcessing, navigate]);

  const handleScanMore = useCallback(() => {
    setView('camera');
  }, [setView]);

  const navigatePreviewPage = useCallback(async (direction: 'previous' | 'next') => {
    const state = useScannerStore.getState();
    if (!state.editingPageId || !state.currentImage) {
      return;
    }

    const currentIndex = state.pages.findIndex((page) => page.id === state.editingPageId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= state.pages.length) {
      return;
    }

    setProcessing(true);

    try {
      const adj: ImageAdjustments = {
        flipH: state.currentFlipH,
        flipV: state.currentFlipV,
        perspectiveH: state.currentPerspectiveH,
        perspectiveV: state.currentPerspectiveV,
        brightness: state.currentBrightness,
        contrast: state.currentContrast,
        shadows: state.currentShadows,
        filterIntensity: state.filterIntensity,
        sharpness: state.currentSharpness,
        warmth: state.currentWarmth,
        saturation: state.currentSaturation,
        highlights: state.currentHighlights,
        vignette: state.currentVignette,
      };
      const result = await processPage(
        state.currentImage,
        state.currentFilter,
        state.currentRotation,
        state.currentCrop,
        state.currentStraighten,
        adj
      );

      useScannerStore.setState((currentState) => ({
        pages: currentState.pages.map((page) => (
          page.id === state.editingPageId
            ? {
                ...page,
                originalBlob: state.currentImage as Blob,
                processedDataUrl: result.dataUrl,
                thumbnail: result.thumbnail,
                filter: state.currentFilter,
                rotation: state.currentRotation,
                straighten: state.currentStraighten,
                cropRect: state.currentCrop,
                flipH: state.currentFlipH,
                flipV: state.currentFlipV,
                perspectiveH: state.currentPerspectiveH,
                perspectiveV: state.currentPerspectiveV,
                brightness: state.currentBrightness,
                contrast: state.currentContrast,
                shadows: state.currentShadows,
                filterIntensity: state.filterIntensity,
                sharpness: state.currentSharpness,
                warmth: state.currentWarmth,
                saturation: state.currentSaturation,
                highlights: state.currentHighlights,
                vignette: state.currentVignette
              }
            : page
        ))
      }));
    } catch (err) {
      setProcessing(false);
      addToast({ kind: 'error', title: 'Could not change page', subtitle: err instanceof Error ? err.message : 'Unknown error' });
      return;
    }

    setProcessing(false);

    const exitClass = direction === 'next' ? 'sf-slide-exit-left' : 'sf-slide-exit-right';
    const enterClass = direction === 'next' ? 'sf-slide-enter-right' : 'sf-slide-enter-left';

    setTransition(exitClass);
    setTimeout(() => {
      pendingEnterRef.current = enterClass;
      setPreviewScale(1.0);
      setPanOffset({ x: 0, y: 0 });
      setCropMode(false);
      setDraftCrop(null);
      editPage(state.pages[nextIndex].id);
    }, 150);
  }, [editPage, setProcessing]);

  // --- Preview pinch-to-zoom + pan handlers ---
  const handlePreviewTouchStart = useCallback((e: React.TouchEvent) => {
    if (cropMode) return;
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: previewScale };
      wasPinchRef.current = true;
    } else if (e.touches.length === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setPreviewScale(1.0);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
      // Pan when zoomed, swipe when not
      if (previewScale > 1.02) {
        panRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panOffset.x, startPanY: panOffset.y };
        swipeRef.current = null;
      } else if (!cropMode) {
        swipeRef.current = { startX: e.touches[0].clientX };
        panRef.current = null;
      }
    }
  }, [previewScale, cropMode, panOffset]);

  const handlePreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (cropMode) return;
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = clampPreviewScale(pinchRef.current.startScale * (dist / pinchRef.current.startDist));
      setPreviewScale(newScale);
    }
  }, [cropMode]);

  const handlePreviewTouchEnd = useCallback((e: React.TouchEvent) => {
    // Swipe detection for gallery navigation — skip in crop mode or after pinch
    if (!cropMode && swipeRef.current && !wasPinchRef.current && e.changedTouches.length === 1 && previewScale <= 1.02) {
      const endX = e.changedTouches[0].clientX;
      const delta = endX - swipeRef.current.startX;
      if (Math.abs(delta) > 80) {
        if (delta > 0) {
          void navigatePreviewPage('previous');
        } else {
          void navigatePreviewPage('next');
        }
      }
    }
    pinchRef.current = null;
    swipeRef.current = null;
    panRef.current = null;
    wasPinchRef.current = false;
  }, [cropMode, navigatePreviewPage, previewScale]);

  const handlePreviewWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (cropMode) {
      return;
    }

    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setPreviewScale((current) => {
      const next = clampPreviewScale(current + delta);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, [cropMode]);

  // --- Mouse drag-to-pan ---
  const handlePreviewMouseDown = useCallback((e: React.MouseEvent) => {
    if (cropMode || previewScale <= 1.02) return;
    e.preventDefault();
    mousePanRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y };
  }, [cropMode, previewScale, panOffset]);

  const handlePreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mousePanRef.current) return;
    const dx = e.clientX - mousePanRef.current.startX;
    const dy = e.clientY - mousePanRef.current.startY;
    setPanOffset({ x: mousePanRef.current.startPanX + dx, y: mousePanRef.current.startPanY + dy });
  }, []);

  const handlePreviewMouseUp = useCallback(() => {
    mousePanRef.current = null;
  }, []);

  useEffect(() => {
    if (view !== 'preview') {
      return;
    }

    const handlePreviewKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handlePreviewClose();
        return;
      }

      if ((event.ctrlKey || event.metaKey)) {
        const h = cropMode ? cropHistory : filterHistory;
        if (event.key === 'z' && !event.shiftKey) {
          event.preventDefault();
          h.undo();
          return;
        }
        if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
          event.preventDefault();
          h.redo();
          return;
        }
      }

      if (cropMode || !editingPageId) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void navigatePreviewPage('previous');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        void navigatePreviewPage('next');
      }
    };

    window.addEventListener('keydown', handlePreviewKeydown);
    return () => window.removeEventListener('keydown', handlePreviewKeydown);
  }, [cropMode, editingPageId, handlePreviewClose, navigatePreviewPage, view, filterHistory, cropHistory]);

  // --- Navigation hint visibility ---
  const currentIdx = editingPageId ? pages.findIndex((p) => p.id === editingPageId) : -1;
  const showPrevButton = !cropMode && !isMobile && editingPageId !== null && currentIdx > 0;
  const showNextButton = !cropMode && !isMobile && editingPageId !== null && currentIdx >= 0 && currentIdx < pages.length - 1;
  const previewCounterLabel = editingPageId !== null && currentIdx >= 0 ? `${currentIdx + 1} / ${pages.length}` : 'New page';

  // --- Render ---
  if (view === 'camera') {
    return <CameraView onCapture={handleCapture} onClose={handleCameraClose} />;
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden-input"
        onChange={handleFileChange}
      />

      {view === 'preview' && (
        <div className="preview-layout">
          <div
            className="preview-area"
            onWheel={handlePreviewWheel}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchCancel={handlePreviewTouchEnd}
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
            onMouseLeave={handlePreviewMouseUp}
          >
            <div className="sf-preview-header">
              <div className="sf-preview-counter" aria-live="polite">{previewCounterLabel}</div>
              <Button
                className="sf-preview-close"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Close}
                iconDescription="Close preview"
                aria-label="Close preview"
                tooltipAlignment="end"
                onClick={handlePreviewClose}
              />
            </div>

            {showPrevButton && (
              <Button
                className="sf-preview-nav-button sf-preview-nav-button--left"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ChevronLeft}
                iconDescription="Previous page"
                aria-label="Previous page"
                onClick={() => { void navigatePreviewPage('previous'); }}
              />
            )}

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className={`preview-image${previewScale !== 1 ? ' zoomed' : ''}${transition ? ` ${transition}` : ''}`}
                style={{ transform: `scale(${previewScale}) translate(${panOffset.x / previewScale}px, ${panOffset.y / previewScale}px)` }}
              />
            )}

            {showNextButton && (
              <Button
                className="sf-preview-nav-button sf-preview-nav-button--right"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ChevronRight}
                iconDescription="Next page"
                aria-label="Next page"
                onClick={() => { void navigatePreviewPage('next'); }}
              />
            )}

            {!cropMode && (
              <div className="sf-edit-history-controls">
                <Button
                  className="sf-edit-history-btn"
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={Undo}
                  iconDescription="Undo"
                  tooltipPosition="left"
                  disabled={!filterHistory.canUndo}
                  onClick={filterHistory.undo}
                />
                <Button
                  className="sf-edit-history-btn"
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={Redo}
                  iconDescription="Redo"
                  tooltipPosition="left"
                  disabled={!filterHistory.canRedo}
                  onClick={filterHistory.redo}
                />
                <Button
                  className="sf-edit-history-btn"
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={Reset}
                  iconDescription="Reset all edits"
                  tooltipPosition="left"
                  disabled={!filterHistory.canReset}
                  onClick={filterHistory.reset}
                />
              </div>
            )}

            {isProcessing && (
              <div className="sf-preview-loader">
                <Loading withOverlay={false} small description="Processing…" />
              </div>
            )}

            {cropMode && cropBaseUrl && (
              <div className="crop-overlay">
                <CropEditor
                  imageUrl={cropBaseUrl}
                  initialCrop={draftCrop}
                  rotation={currentRotation}
                  straighten={currentStraighten}
                  flipH={currentFlipH}
                  flipV={currentFlipV}
                  perspectiveH={currentPerspectiveH}
                  perspectiveV={currentPerspectiveV}
                  canUndo={cropHistory.canUndo}
                  canRedo={cropHistory.canRedo}
                  canReset={cropHistory.canReset}
                  onUndo={cropHistory.undo}
                  onRedo={cropHistory.redo}
                  onReset={cropHistory.reset}
                  onRotate={handleRotate}
                  onStraightenChange={(v: number) => setStraighten(v)}
                  onFlipH={() => {
                    const rot = ((useScannerStore.getState().currentRotation % 360) + 360) % 360;
                    setFlipH(!currentFlipH);

                    // FlipH in pre-rotation space = mirrorH at 0°/180°, mirrorV at 90°/270°
                    const useVertical = rot === 90 || rot === 270;
                    const transform = (q: QuadCrop): QuadCrop => useVertical
                      ? { tl: { x: q.bl.x, y: 1 - q.bl.y }, tr: { x: q.br.x, y: 1 - q.br.y }, br: { x: q.tr.x, y: 1 - q.tr.y }, bl: { x: q.tl.x, y: 1 - q.tl.y } }
                      : { tl: { x: 1 - q.tr.x, y: q.tr.y }, tr: { x: 1 - q.tl.x, y: q.tl.y }, br: { x: 1 - q.bl.x, y: q.bl.y }, bl: { x: 1 - q.br.x, y: q.br.y } };
                    applyCropTransform(transform);
                  }}
                  onFlipV={() => {
                    const rot = ((useScannerStore.getState().currentRotation % 360) + 360) % 360;
                    setFlipV(!currentFlipV);

                    // FlipV in pre-rotation space = mirrorV at 0°/180°, mirrorH at 90°/270°
                    const useHorizontal = rot === 90 || rot === 270;
                    const transform = (q: QuadCrop): QuadCrop => useHorizontal
                      ? { tl: { x: 1 - q.tr.x, y: q.tr.y }, tr: { x: 1 - q.tl.x, y: q.tl.y }, br: { x: 1 - q.bl.x, y: q.bl.y }, bl: { x: 1 - q.br.x, y: q.br.y } }
                      : { tl: { x: q.bl.x, y: 1 - q.bl.y }, tr: { x: q.br.x, y: 1 - q.br.y }, br: { x: q.tr.x, y: 1 - q.tr.y }, bl: { x: q.tl.x, y: 1 - q.tl.y } };
                    applyCropTransform(transform);
                  }}
                  onPerspectiveHChange={(v: number) => setPerspectiveH(v)}
                  onPerspectiveVChange={(v: number) => setPerspectiveV(v)}
                  onChange={(crop: QuadCrop) => setDraftCrop(crop)}
                  onConfirm={handleCropConfirm}
                  onCancel={handleCropCancel}
                />
              </div>
            )}
          </div>

          {!cropMode && (
          <div className="preview-bottom-panel">
            <AdjustmentBar
              activeFilter={currentFilter}
              filterIntensity={filterIntensity}
              brightness={currentBrightness}
              contrast={currentContrast}
              shadows={currentShadows}
              sharpness={currentSharpness}
              warmth={currentWarmth}
              saturation={currentSaturation}
              highlights={currentHighlights}
              vignette={currentVignette}
              onFilterIntensityChange={setFilterIntensity}
              onBrightnessChange={setBrightness}
              onContrastChange={setContrast}
              onShadowsChange={setShadows}
              onSharpnessChange={setSharpness}
              onWarmthChange={setWarmth}
              onSaturationChange={setSaturation}
              onHighlightsChange={setHighlights}
              onVignetteChange={setVignette}
            />

            {currentImage && (
              <FilterBar
                sourceBlob={currentImage}
                activeFilter={currentFilter}
                onSelect={(f: FilterType) => setFilter(f)}
              />
            )}
          </div>
          )}

            <div className="preview-actions-wrapper">
            <div className="preview-actions">
              <Button
                kind="ghost"
                size="sm"
                renderIcon={ArrowLeft}
                iconDescription="Back"
                aria-label="Back"
                hasIconOnly={isMobile}
                onClick={handleRetake}
              >
                {!isMobile ? 'Back' : null}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={cropMode ? SettingsAdjust : Crop}
                iconDescription={cropMode ? 'Filters' : 'Crop'}
                aria-label={cropMode ? 'Filters' : 'Crop'}
                hasIconOnly={isMobile}
                onClick={handleToggleCrop}
              >
                {!isMobile ? (cropMode ? 'Filters' : 'Crop') : null}
              </Button>
              <Button
                kind="primary"
                size="sm"
                renderIcon={ArrowRight}
                iconDescription="Next"
                aria-label="Next"
                hasIconOnly={isMobile}
                disabled={isProcessing || !previewUrl}
                onClick={handleSavePage}
              >
                {!isMobile ? 'Next' : null}
              </Button>
            </div>
            </div>
        </div>
      )}

      {view === 'idle' && (
      <div className="scanner-page">
          <>
            <section className="page-header">
              <h1>
                Scanner
                {pages.length > 0 && (
                  <Tag type="blue" className="page-counter-tag">{pages.length} / {MAX_PAGES}</Tag>
                )}
              </h1>
              <p>Scan documents with your camera or import images from gallery.</p>
            </section>

            <div className="action-cards">
              <button className="action-card" onClick={() => setView('camera')}>
                <div className="action-icon"><Scan size={24} /></div>
                <div className="action-text">
                  <strong>Scan with Camera</strong>
                  <span>Auto-detect document edges, crop, and enhance</span>
                </div>
              </button>

              <button className="action-card" onClick={handleImportClick}>
                <div className="action-icon"><ImageIcon size={24} /></div>
                <div className="action-text">
                  <strong>Import from Gallery</strong>
                  <span>Load one or multiple images from your photo gallery</span>
                </div>
              </button>
            </div>

            {pages.length > 0 ? (
              <section className="gallery-section">
                <PageGallery
                  pages={pages}
                  maxPages={MAX_PAGES}
                  onEdit={handleEditPage}
                  onDelete={handleDeletePage}
                />
              </section>
            ) : (
              <div className="empty-gallery">
                <DocumentPdf size={48} />
                <p>You haven't scanned anything yet</p>
                <span>Scan or import images to get started. Up to {MAX_PAGES} pages per session.</span>
              </div>
            )}
          </>
      </div>
      )}

      {view === 'gallery' && (
          <div className="gallery-layout">
            <div className="gallery-top">
              <section className="page-header compact">
                <h1>
                  Scanned Pages
                  <Tag type="blue" className="page-counter-tag">{pages.length} / {MAX_PAGES}</Tag>
                </h1>
              </section>

              <div className="gallery-actions">
                <Button kind="tertiary" size="sm" renderIcon={Scan} onClick={handleScanMore}>
                  Scan More Pages
                </Button>
                <Button kind="ghost" size="sm" renderIcon={Add} onClick={handleImportClick}>
                  Import Images
                </Button>
              </div>
            </div>

            <div className="gallery-scroll">
              <PageGallery
                pages={pages}
                maxPages={MAX_PAGES}
                onEdit={handleEditPage}
                onDelete={handleDeletePage}
              />
            </div>

            <div className="gallery-bottom">
              <Button
                kind="primary"
                size="sm"
                renderIcon={Download}
                iconDescription="Export"
                aria-label="Export"
                hasIconOnly={isMobile}
                onClick={() => setExportSheetOpen(true)}
              >
                {!isMobile ? 'Export' : null}
              </Button>
              <Button kind="secondary" size="sm" renderIcon={ArrowRight} onClick={handleOpenManipulator}>
                Open PDF Tools
              </Button>
            </div>
          </div>
        )}

      <ActionSheet
        open={exportSheetOpen}
        title="Export Scans"
        onClose={() => setExportSheetOpen(false)}
        options={[
          {
            id: 'export-pdf',
            label: 'Export as PDF',
            description: 'Save all pages into one PDF file.',
            onSelect: handleExport,
          },
          {
            id: 'export-jpg',
            label: 'Export as JPG files',
            description: 'Download each page as its own image.',
            onSelect: handleExportImages,
          },
          {
            id: 'share-pdf',
            label: 'Share',
            description: 'Open your device share sheet to send the PDF.',
            onSelect: handleShare,
          },
        ]}
      />

      {isProcessing && view !== 'preview' && (
        <div className="processing-overlay">
          <Loading withOverlay={false} small description="Processingâ€¦" />
        </div>
      )}
    </>
  );
}

