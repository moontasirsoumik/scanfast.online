import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loading } from '@carbon/react';
import { Scan, Image as ImageIcon, DocumentPdf, Add, Crop, Download, ArrowLeft } from '@carbon/icons-react';
import { useScannerStore, MAX_PAGES, type QuadCrop, type FilterType } from '@/stores/scanner';
import { useManipulatorStore } from '@/stores/manipulator';
import { addToast } from '@/stores/toast';
import { processPage, readExifOrientation, exifOrientationToDegrees } from '@/services/filters';
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
  const [cameFromCamera, setCameFromCamera] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState<QuadCrop | null>(null);
  const [rawImageUrl, setRawImageUrl] = useState('');
  const [previewScale, setPreviewScale] = useState(1.0);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const lastTapRef = useRef(0);
  const swipeRef = useRef<{ startX: number } | null>(null);

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
    setCameFromCamera(true);
    captureImage(blob);
    const orientation = await readExifOrientation(blob);
    const degrees = exifOrientationToDegrees(orientation);
    if (degrees !== 0) {
      setRotation(degrees);
      addToast({ kind: 'info', title: 'Auto-rotated from EXIF', subtitle: `Rotated ${degrees}°` });
    }
  }, [captureImage, setRotation]);

  const handleCameraClose = useCallback(() => {
    const state = useScannerStore.getState();
    setView(state.pages.length > 0 ? 'gallery' : 'idle');
  }, [setView]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCameFromCamera(false);
      captureImage(file);
      readExifOrientation(file).then((orientation) => {
        const degrees = exifOrientationToDegrees(orientation);
        if (degrees !== 0) {
          setRotation(degrees);
          addToast({ kind: 'info', title: 'Auto-rotated from EXIF', subtitle: `Rotated ${degrees}°` });
        }
      });
    }
    e.target.value = '';
  }, [captureImage, setRotation]);

  const handleSavePage = useCallback(async () => {
    const state = useScannerStore.getState();
    if (!state.currentImage) return;
    if (!state.editingPageId && state.pages.length >= MAX_PAGES) {
      addToast({ kind: 'warning', title: 'Page limit reached', subtitle: 'Maximum 20 pages per session.' });
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
    setView(cameFromCamera ? 'camera' : 'idle');
  }, [cameFromCamera, resetPreview, setView]);

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
    setCameFromCamera(false);
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
    } else if (e.touches.length === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setPreviewScale(1.0);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
      // Swipe tracking
      swipeRef.current = { startX: e.touches[0].clientX };
    }
  }, [previewScale]);

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
    // Swipe detection for gallery navigation
    if (swipeRef.current && e.changedTouches.length === 1 && previewScale <= 1.0) {
      const endX = e.changedTouches[0].clientX;
      const delta = endX - swipeRef.current.startX;
      const state = useScannerStore.getState();
      if (state.editingPageId && Math.abs(delta) > 50) {
        const idx = state.pages.findIndex((p) => p.id === state.editingPageId);
        if (delta > 0 && idx > 0) {
          setPreviewScale(1.0);
          editPage(state.pages[idx - 1].id);
        } else if (delta < 0 && idx < state.pages.length - 1) {
          setPreviewScale(1.0);
          editPage(state.pages[idx + 1].id);
        }
      }
    }
    pinchRef.current = null;
    swipeRef.current = null;
  }, [previewScale, editPage]);

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
                className={`preview-image${previewScale !== 1 ? ' zoomed' : ''}`}
                style={{ transform: `scale(${previewScale})` }}
              />
            ) : (
              <div className="preview-loading">
                <Loading withOverlay={false} small />
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
                iconDescription={cameFromCamera ? 'Retake' : 'Back'}
                aria-label={cameFromCamera ? 'Retake' : 'Back'}
                hasIconOnly={isMobile}
                onClick={handleRetake}
              >
                {!isMobile ? (cameFromCamera ? 'Retake' : 'Back') : null}
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
                renderIcon={Download}
                iconDescription="Save page"
                aria-label="Save page"
                hasIconOnly={isMobile}
                disabled={isProcessing || !previewUrl}
                onClick={handleSavePage}
              >
                {!isMobile ? 'Save Page' : null}
              </Button>
            </div>
          </div>
        </div>
      )}

      {view !== 'preview' && (
      <div className="scanner-page">
        {view === 'idle' && (
          <>
            <section className="page-header">
              <h1>Scanner</h1>
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
                  <span>Load images and process them as scanned documents</span>
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
                  onOpenExport={() => setExportSheetOpen(true)}
                  onManipulator={handleOpenManipulator}
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
        )}

        {view === 'gallery' && (
          <>
            <section className="page-header compact">
              <h1>Scanned Pages</h1>
              <p>{pages.length} / {MAX_PAGES} pages</p>
            </section>

            <div className="gallery-actions">
              <Button kind="tertiary" size="sm" renderIcon={Scan} onClick={handleScanMore}>
                Scan Another Page
              </Button>
              <Button kind="ghost" size="sm" renderIcon={Add} onClick={handleImportClick}>
                Import Image
              </Button>
            </div>

            <section className="gallery-section">
              <PageGallery
                pages={pages}
                maxPages={MAX_PAGES}
                onEdit={handleEditPage}
                onDelete={handleDeletePage}
                onOpenExport={() => setExportSheetOpen(true)}
                onManipulator={handleOpenManipulator}
              />
            </section>
          </>
        )}
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
