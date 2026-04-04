import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loading, Tag } from '@carbon/react';
import { Scan, Image as ImageIcon, DocumentPdf, Add, Crop, ArrowLeft, ArrowRight, Download, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import { useScannerStore, MAX_PAGES, type QuadCrop, type FilterType, type ScannedPage } from '@/stores/scanner';
import { useManipulatorStore } from '@/stores/manipulator';
import { addToast } from '@/stores/toast';
import { processPage, readExifOrientation, exifOrientationToDegrees, downscaleBlob } from '@/services/filters';
import { downloadBlob, loadFiles } from '@/services/pdf';
import CameraView from '@/components/scanner/CameraView';
import CropEditor from '@/components/scanner/CropEditor';
import FilterBar from '@/components/scanner/FilterBar';
import RotationControls from '@/components/scanner/RotationControls';
import PageGallery from '@/components/scanner/PageGallery';
import ActionSheet from '@/components/shared/ActionSheet';
import useIsMobile from '@/hooks/useIsMobile';
import './ScannerPage.css';

/** Scanner page — capture, crop, filter, and manage scanned pages */
export default function ScannerPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [previewUrl, setPreviewUrl] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState<QuadCrop | null>(null);
  const [rawImageUrl, setRawImageUrl] = useState('');
  const [previewScale, setPreviewScale] = useState(1.0);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [transition, setTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ startX: number } | null>(null);
  const wasPinchRef = useRef(false);

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
    processPage(currentImage, currentFilter, currentRotation, currentCrop, currentStraighten)
      .then((result) => {
        if (!cancelled) {
          setPreviewUrl(result.dataUrl);
          setProcessing(false);
        }
      });
    return () => { cancelled = true; };
  }, [currentImage, currentFilter, currentRotation, currentCrop, currentStraighten, setProcessing]);

  // Keep raw object URL for crop editor
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setRawImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setRawImageUrl('');
    }
  }, [currentImage]);

  useEffect(() => {
    setDraftCrop(currentCrop);
  }, [currentCrop, currentImage, editingPageId]);

  // --- Handlers ---
  const handleCapture = useCallback(async (blob: Blob) => {
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
      const result = await processPage(scaled, 'original', degrees, null, 0);
      const page: ScannedPage = {
        id: crypto.randomUUID(),
        originalBlob: scaled,
        processedDataUrl: result.dataUrl,
        thumbnail: result.thumbnail,
        filter: 'original',
        rotation: degrees,
        straighten: 0,
        cropRect: null
      };
      const added = useScannerStore.getState().addPage(page);
      if (added) {
        const count = useScannerStore.getState().pages.length;
        addToast({ kind: 'info', title: `Page ${count} captured`, subtitle: 'Tap Done when finished.', duration: 1200 });
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
      // Single file → go to preview for editing
      const scaled = await downscaleBlob(fileList[0]);
      captureImage(scaled);
      const orientation = await readExifOrientation(scaled);
      const degrees = exifOrientationToDegrees(orientation);
      if (degrees !== 0) {
        setRotation(degrees);
      }
      return;
    }

    // Multiple files → batch import with default settings, go to gallery
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
        const result = await processPage(scaled, 'original', degrees, null, 0);
        newPages.push({
          id: crypto.randomUUID(),
          originalBlob: scaled,
          processedDataUrl: result.dataUrl,
          thumbnail: result.thumbnail,
          filter: 'original',
          rotation: degrees,
          straighten: 0,
          cropRect: null
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
      const result = await processPage(
        state.currentImage,
        state.currentFilter,
        state.currentRotation,
        state.currentCrop,
        state.currentStraighten
      );
      savePage(result.dataUrl, result.thumbnail);
      setCropMode(false);
    } catch (err) {
      addToast({ kind: 'error', title: 'Failed to save page', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setProcessing(false);
    }
  }, [setProcessing, savePage]);

  const handleRetake = useCallback(() => {
    setCropMode(false);
    setDraftCrop(null);
    setPreviewScale(1.0);
    resetPreview();
    const state = useScannerStore.getState();
    setView(state.pages.length > 0 ? 'gallery' : 'idle');
  }, [resetPreview, setView]);

  const handleToggleCrop = useCallback(() => {
    setDraftCrop(currentCrop);
    setCropMode((prev) => !prev);
  }, [currentCrop]);

  const handleCropConfirm = useCallback(() => {
    setCrop(draftCrop);
    setCropMode(false);
  }, [draftCrop, setCrop]);

  const handleCropCancel = useCallback(() => {
    setDraftCrop(currentCrop);
    setCropMode(false);
  }, [currentCrop]);

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

  // --- Preview pinch-to-zoom handlers ---
  const handlePreviewTouchStart = useCallback((e: React.TouchEvent) => {
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
      // Swipe tracking — skip during crop mode
      if (!cropMode) {
        swipeRef.current = { startX: e.touches[0].clientX };
      }
    }
  }, [previewScale, cropMode]);

  const handlePreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5.0, Math.max(0.5, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setPreviewScale(newScale);
    }
  }, []);

  const handlePreviewTouchEnd = useCallback((e: React.TouchEvent) => {
    // Swipe detection for gallery navigation — skip in crop mode or after pinch
    if (!cropMode && swipeRef.current && !wasPinchRef.current && e.changedTouches.length === 1 && previewScale <= 1.0) {
      const endX = e.changedTouches[0].clientX;
      const delta = endX - swipeRef.current.startX;
      const state = useScannerStore.getState();
      if (state.editingPageId && Math.abs(delta) > 80) {
        const idx = state.pages.findIndex((p) => p.id === state.editingPageId);
        if (delta > 0 && idx > 0) {
          setTransition('slide-right');
          setPreviewScale(1.0);
          editPage(state.pages[idx - 1].id);
          setTimeout(() => setTransition('none'), 250);
        } else if (delta < 0 && idx < state.pages.length - 1) {
          setTransition('slide-left');
          setPreviewScale(1.0);
          editPage(state.pages[idx + 1].id);
          setTimeout(() => setTransition('none'), 250);
        }
      }
    }
    pinchRef.current = null;
    swipeRef.current = null;
    wasPinchRef.current = false;
  }, [cropMode, previewScale, editPage]);

  // --- Navigation hint visibility ---
  const currentIdx = editingPageId ? pages.findIndex((p) => p.id === editingPageId) : -1;
  const showPrevHint = !cropMode && editingPageId !== null && currentIdx > 0;
  const showNextHint = !cropMode && editingPageId !== null && currentIdx >= 0 && currentIdx < pages.length - 1;

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
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchCancel={handlePreviewTouchEnd}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className={`preview-image${previewScale !== 1 ? ' zoomed' : ''}${transition !== 'none' ? ` ${transition}` : ''}`}
                style={{ transform: `scale(${previewScale})` }}
              />
            ) : (
              <div className="preview-loading">
                <Loading withOverlay={false} small />
              </div>
            )}

            {showPrevHint && (
              <div className="nav-hint nav-hint--left" aria-hidden="true">
                <ChevronLeft size={16} />
              </div>
            )}
            {showNextHint && (
              <div className="nav-hint nav-hint--right" aria-hidden="true">
                <ChevronRight size={16} />
              </div>
            )}

            {cropMode && rawImageUrl && (
              <div className="crop-overlay">
                <CropEditor
                  imageUrl={rawImageUrl}
                  initialCrop={draftCrop}
                  onChange={(crop: QuadCrop) => setDraftCrop(crop)}
                  onConfirm={handleCropConfirm}
                  onCancel={handleCropCancel}
                />
              </div>
            )}
          </div>

          <div className="preview-bottom-panel">
            <RotationControls
              rotation={currentRotation}
              straighten={currentStraighten}
              onRotate={(deg: number) => setRotation(deg)}
              onStraighten={(deg: number) => setStraighten(deg)}
            />

            {currentImage && (
              <FilterBar
                sourceBlob={currentImage}
                activeFilter={currentFilter}
                onSelect={(f: FilterType) => setFilter(f)}
              />
            )}

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
                renderIcon={Crop}
                iconDescription={cropMode ? 'Cancel crop' : 'Adjust corners'}
                aria-label={cropMode ? 'Cancel crop' : 'Adjust corners'}
                hasIconOnly={isMobile}
                onClick={handleToggleCrop}
              >
                {!isMobile ? (cropMode ? 'Cancel' : 'Adjust Corners') : null}
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
        ]}
      />

      {isProcessing && (
        <div className="processing-overlay">
          <Loading withOverlay={false} small description="Processing…" />
        </div>
      )}
    </>
  );
}
