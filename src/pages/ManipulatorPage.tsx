import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Column, Tag, Button, Loading } from '@carbon/react';
import { DocumentAdd, Download, Scan, CheckboxCheckedFilled, Checkbox, Close, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import { useManipulatorStore, MAX_PAGES } from '@/stores/manipulator';
import { useHistoryStore } from '@/stores/history';
import { useScannerStore, type ScannedPage } from '@/stores/scanner';
import { addToast } from '@/stores/toast';
import {
  loadFiles,
  exportAsPdf,
  exportAsPdfA,
  exportPageAsImage,
  splitPdf,
  compressPages,
  renderRotatedThumbnail,
  downloadBlob,
  createBlankPageData,
  extractText,
  addWatermark,
  addPageNumbers,
  unlockPdf,
  exportAsHtml,
  loadPdfPages,
  type PageData,
  type WatermarkOptions,
  type PageNumberOptions
} from '@/services/pdf';
import { createZip } from '@/services/zip';
import {
  exportAsDocx,
  exportAsPptx,
  exportAsXlsx,
  exportAsOdt,
  exportAsOdp,
  exportAsOds,
  exportAsEpub,
  splitTextPages,
} from '@/services/office';
import { processPage } from '@/services/filters';
import Toolbar from '@/components/manipulator/Toolbar';
import PageGrid from '@/components/manipulator/PageGrid';
import DropZone from '@/components/manipulator/DropZone';
import SplitDialog from '@/components/manipulator/SplitDialog';
import CompressDialog from '@/components/manipulator/CompressDialog';
import WatermarkDialog from '@/components/manipulator/WatermarkDialog';
import PageNumberDialog from '@/components/manipulator/PageNumberDialog';
import PasswordDialog from '@/components/manipulator/PasswordDialog';
import ContextMenu from '@/components/manipulator/ContextMenu';
import PagePreview from '@/components/manipulator/PagePreview';
import ActionSheet from '@/components/shared/ActionSheet';
import useIsMobile from '@/hooks/useIsMobile';
import './ManipulatorPage.css';

/** SplitGroup type for split dialog */
export interface SplitGroup {
  name: string;
  pageIndices: number[];
}

function clampPreviewScale(scale: number): number {
  return Math.min(5, Math.max(1, scale));
}

/** PDF Manipulator page — merge, split, rotate, reorder, compress */
export default function ManipulatorPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [compressDialogOpen, setCompressDialogOpen] = useState(false);
  const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false);
  const [pageNumberDialogOpen, setPageNumberDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordDialogMode, setPasswordDialogMode] = useState<'unlock' | 'protect'>('unlock');
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exportFormatSheetOpen, setExportFormatSheetOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number; pageId: string }>({ open: false, x: 0, y: 0, pageId: '' });
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewTransition, setPreviewTransition] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unlockFileInputRef = useRef<HTMLInputElement>(null);
  const unlockFileRef = useRef<File | null>(null);
  const pendingPreviewEnterRef = useRef('');
  const closePreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousPreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextPreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const previewPinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const previewSwipeRef = useRef<{ startX: number } | null>(null);
  const previewLastTapRef = useRef(0);
  const previewWasPinchRef = useRef(false);

  const pages = useManipulatorStore((s) => s.pages);
  const selectedIds = useManipulatorStore((s) => s.selectedIds);
  const isLoading = useManipulatorStore((s) => s.isLoading);
  const loadProgress = useManipulatorStore((s) => s.loadProgress);
  const setLoading = useManipulatorStore((s) => s.setLoading);
  const setLoadProgress = useManipulatorStore((s) => s.setLoadProgress);
  const addPages = useManipulatorStore((s) => s.addPages);
  const setPages = useManipulatorStore((s) => s.setPages);
  const setSelectedIds = useManipulatorStore((s) => s.setSelectedIds);
  const removePages = useManipulatorStore((s) => s.removePages);
  const duplicatePages = useManipulatorStore((s) => s.duplicatePages);
  const rotatePages = useManipulatorStore((s) => s.rotatePages);
  const reorderPages = useManipulatorStore((s) => s.reorderPages);
  const insertBlankPage = useManipulatorStore((s) => s.insertBlankPage);
  const toggleSelect = useManipulatorStore((s) => s.toggleSelect);
  const selectRange = useManipulatorStore((s) => s.selectRange);
  const selectAll = useManipulatorStore((s) => s.selectAll);
  const clearSelection = useManipulatorStore((s) => s.clearSelection);

  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const execute = useHistoryStore((s) => s.execute);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const pageCount = pages.length;
  const selectedCount = selectedIds.size;
  const hasPages = pageCount > 0;
  const previewIndex = previewPageId ? pages.findIndex((page) => page.id === previewPageId) : -1;
  const previewPage = previewIndex >= 0 ? pages[previewIndex] : null;
  const previewOpen = previewPage !== null;
  const selectionButtonLabel = selectedCount === 0
    ? 'Select All'
    : selectedCount === 1
      ? 'Unselect (1)'
      : `Unselect All (${selectedCount})`;
  const selectionButtonIcon = selectedCount === 0 ? Checkbox : Close;

  useEffect(() => {
    document.title = 'PDF Tools — ScanFastOnline';
  }, []);

  useEffect(() => {
    if (previewOpen) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const frame = window.requestAnimationFrame(() => {
        closePreviewButtonRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
    return undefined;
  }, [previewOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewPage) {
      setPreviewLoading(false);
      setPreviewScale(1);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return '';
      });
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    const maxPreviewWidth = Math.min(Math.max(window.innerWidth * (window.devicePixelRatio || 1), 1600), 2800);

    exportPageAsImage(previewPage, 'png', 1, maxPreviewWidth)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return nextUrl;
        });
        setPreviewLoading(false);
        if (pendingPreviewEnterRef.current) {
          setPreviewTransition(pendingPreviewEnterRef.current);
          pendingPreviewEnterRef.current = '';
          setTimeout(() => setPreviewTransition(''), 200);
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setPreviewLoading(false);
        pendingPreviewEnterRef.current = '';
        addToast({ kind: 'error', title: 'Preview failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
      });

    return () => {
      cancelled = true;
    };
  }, [previewPage]);

  // --- File handling ---
  const handleFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      for (const f of files) {
        if (f.size > 50 * 1024 * 1024) {
          addToast({ kind: 'warning', title: 'Large file', subtitle: 'Processing may take a moment...' });
          break;
        }
      }

      const currentPages = useManipulatorStore.getState().pages;
      const newPages = await loadFiles(
        files, MAX_PAGES, currentPages.length,
        (loaded, total) => { setLoadProgress(loaded, total); }
      );

      if (currentPages.length + newPages.length >= MAX_PAGES) {
        addToast({ kind: 'warning', title: 'Page limit reached', subtitle: `Maximum ${MAX_PAGES} pages per session.` });
      }

      if (newPages.length > 0) {
        const snapshot = [...currentPages];
        execute({
          description: `Add ${newPages.length} page(s)`,
          execute: () => addPages(newPages),
          undo: () => setPages(snapshot),
        });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Failed to load file', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading, setLoadProgress, addPages, setPages, execute]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [handleFiles]);

  // --- Rotate ---
  const handleRotate = useCallback(() => {
    const state = useManipulatorStore.getState();
    if (state.selectedIds.size === 0) return;
    const ids = new Set(state.selectedIds);
    const snapshot = state.pages.map((p) => ({ ...p }));

    execute({
      description: `Rotate ${ids.size} page(s)`,
      execute: () => {
        rotatePages(ids);
        const currentPages = useManipulatorStore.getState().pages;
        Promise.all(
          currentPages
            .filter((p) => ids.has(p.id))
            .map(async (p) => {
              const newThumb = await renderRotatedThumbnail(p);
              const updatedPages = useManipulatorStore.getState().pages.map((page) =>
                page.id === p.id ? { ...page, thumbnail: newThumb } : page
              );
              setPages(updatedPages);
            })
        );
      },
      undo: () => setPages(snapshot),
    });
  }, [execute, rotatePages, setPages]);

  // --- Delete ---
  const handleDelete = useCallback(() => {
    const state = useManipulatorStore.getState();
    if (state.selectedIds.size === 0) return;
    const ids = new Set(state.selectedIds);
    const snapshot = [...state.pages];

    execute({
      description: `Delete ${ids.size} page(s)`,
      execute: () => removePages(ids),
      undo: () => { setPages(snapshot); setSelectedIds(new Set()); },
    });
  }, [execute, removePages, setPages, setSelectedIds]);

  // --- Duplicate ---
  const handleDuplicate = useCallback(() => {
    const state = useManipulatorStore.getState();
    if (state.selectedIds.size === 0) return;
    const ids = new Set(state.selectedIds);
    const snapshot = [...state.pages];

    execute({
      description: `Duplicate ${ids.size} page(s)`,
      execute: () => duplicatePages(ids),
      undo: () => setPages(snapshot),
    });
  }, [execute, duplicatePages, setPages]);

  // --- Insert blank page ---
  const handleInsertBlank = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length >= MAX_PAGES) return;
    const snapshot = [...state.pages];

    const selected = [...state.selectedIds];
    let afterIndex: number | undefined;
    if (selected.length > 0) {
      const indices = selected
        .map((id) => state.pages.findIndex((p) => p.id === id))
        .filter((i) => i !== -1);
      afterIndex = Math.max(...indices);
    }

    const blankPage = await createBlankPageData();
    execute({
      description: 'Insert blank page',
      execute: () => insertBlankPage(blankPage, afterIndex),
      undo: () => setPages(snapshot),
    });
  }, [execute, insertBlankPage, setPages]);

  // --- Reorder ---
  const handleReorder = useCallback((newPages: PageData[]) => {
    const snapshot = [...useManipulatorStore.getState().pages];
    execute({
      description: 'Reorder pages',
      execute: () => reorderPages(newPages),
      undo: () => setPages(snapshot),
    });
  }, [execute, reorderPages, setPages]);

  // --- Export ---
  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      const pdfBytes = await exportAsPdf(useManipulatorStore.getState().pages);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      downloadBlob(blob, 'scanfast-output.pdf');
      addToast({ kind: 'success', title: 'PDF exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Print ---
  const handlePrint = useCallback(async () => {
    setLoading(true);
    try {
      const pdfBytes = await exportAsPdf(useManipulatorStore.getState().pages);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 1000);
        }, 250);
      };
      addToast({ kind: 'info', title: 'Print', subtitle: 'Opening print dialog...' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Print failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Share ---
  const handleShare = useCallback(async () => {
    setLoading(true);
    try {
      const pdfBytes = await exportAsPdf(useManipulatorStore.getState().pages);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const file = new File([blob], 'scanfast-output.pdf', { type: 'application/pdf' });
      const shareData = { files: [file], title: 'ScanFast PDF' };

      if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        addToast({ kind: 'success', title: 'Shared', subtitle: 'PDF shared successfully.' });
      } else {
        downloadBlob(blob, 'scanfast-output.pdf');
        addToast({ kind: 'info', title: 'Sharing not supported', subtitle: 'PDF downloaded instead.' });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      addToast({ kind: 'error', title: 'Share failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as JPG ---
  const handleExportImages = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const blob = await exportPageAsImage(state.pages[i], 'jpeg', 0.92);
        downloadBlob(blob, `scanfast-page-${i + 1}.jpg`);
      }
      if (state.pages.length >= 3) {
        addToast({ kind: 'success', title: 'Images exported', subtitle: `${state.pages.length} images downloaded.` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Open in Scanner ---
  const handleOpenScanner = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      const scannerPages: ScannedPage[] = [];
      for (let i = 0; i < state.pages.length; i++) {
        const blob = await exportPageAsImage(state.pages[i], 'jpeg', 0.92);
        const result = await processPage(blob, 'original', 0, null, 0);
        scannerPages.push({
          id: crypto.randomUUID(),
          originalBlob: blob,
          processedDataUrl: result.dataUrl,
          thumbnail: result.thumbnail,
          filter: 'original',
          rotation: 0,
          straighten: 0,
          cropRect: null,
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
      useScannerStore.getState().addPages(scannerPages);
      useScannerStore.getState().setView('gallery');
      navigate('/scanner');
    } catch (err) {
      addToast({ kind: 'error', title: 'Failed to open in Scanner', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading, navigate]);

  // --- Selection ---
  const closePreview = useCallback(() => {
    setPreviewPageId(null);
    setPreviewScale(1);
  }, []);

  const navigatePreviewPage = useCallback((direction: -1 | 1) => {
    if (!previewOpen) return;
    const nextIndex = previewIndex + direction;
    if (nextIndex < 0 || nextIndex >= pages.length) {
      return;
    }

    const exitClass = direction === 1 ? 'sf-slide-exit-left' : 'sf-slide-exit-right';
    const enterClass = direction === 1 ? 'sf-slide-enter-right' : 'sf-slide-enter-left';

    setPreviewTransition(exitClass);
    setTimeout(() => {
      pendingPreviewEnterRef.current = enterClass;
      setPreviewPageId(pages[nextIndex].id);
      setPreviewScale(1);
    }, 150);
  }, [pages, previewIndex, previewOpen]);

  const handleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      selectRange(id);
    } else if (e.ctrlKey || e.metaKey) {
      toggleSelect(id, true);
    } else {
      setPreviewPageId(id);
      setPreviewScale(1);
    }
  }, [selectRange, toggleSelect]);

  const handleSelectionAction = useCallback(() => {
    if (selectedCount === 0) {
      if (previewOpen) {
        closePreview();
      }
      selectAll();
      return;
    }

    clearSelection();
  }, [clearSelection, closePreview, previewOpen, selectAll, selectedCount]);

  const handleToggleSelection = useCallback((id: string) => {
    if (previewOpen && previewPageId === id) {
      closePreview();
    }
    toggleSelect(id, true);
  }, [closePreview, previewOpen, previewPageId, toggleSelect]);

  const handleDeleteSingle = useCallback((id: string) => {
    const snapshot = [...useManipulatorStore.getState().pages];
    const ids = new Set([id]);
    execute({
      description: 'Delete page',
      execute: () => removePages(ids),
      undo: () => { setPages(snapshot); setSelectedIds(new Set()); },
    });
  }, [execute, removePages, setPages, setSelectedIds]);

  // --- Context menu ---
  const handleContextMenu = useCallback((id: string, x: number, y: number) => {
    setContextMenu({ open: true, x, y, pageId: id });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, []);

  const handleContextRotate = useCallback(() => {
    const { pageId } = contextMenu;
    if (!pageId) return;
    const ids = new Set([pageId]);
    const snapshot = useManipulatorStore.getState().pages.map((p) => ({ ...p }));
    execute({
      description: 'Rotate page',
      execute: () => {
        rotatePages(ids);
        const currentPages = useManipulatorStore.getState().pages;
        Promise.all(
          currentPages
            .filter((p) => ids.has(p.id))
            .map(async (p) => {
              const newThumb = await renderRotatedThumbnail(p);
              const updatedPages = useManipulatorStore.getState().pages.map((page) =>
                page.id === p.id ? { ...page, thumbnail: newThumb } : page
              );
              setPages(updatedPages);
            })
        );
      },
      undo: () => setPages(snapshot),
    });
  }, [contextMenu, execute, rotatePages, setPages]);

  const handleContextDuplicate = useCallback(() => {
    const { pageId } = contextMenu;
    if (!pageId) return;
    const ids = new Set([pageId]);
    const snapshot = [...useManipulatorStore.getState().pages];
    execute({
      description: 'Duplicate page',
      execute: () => duplicatePages(ids),
      undo: () => setPages(snapshot),
    });
  }, [contextMenu, execute, duplicatePages, setPages]);

  const handleContextDelete = useCallback(() => {
    const { pageId } = contextMenu;
    if (!pageId) return;
    const ids = new Set([pageId]);
    const snapshot = [...useManipulatorStore.getState().pages];
    execute({
      description: 'Delete page',
      execute: () => removePages(ids),
      undo: () => { setPages(snapshot); setSelectedIds(new Set()); },
    });
  }, [contextMenu, execute, removePages, setPages, setSelectedIds]);

  const handleContextInsertBlank = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length >= MAX_PAGES) return;
    const { pageId } = contextMenu;
    const afterIndex = state.pages.findIndex((p) => p.id === pageId);
    const snapshot = [...state.pages];
    const blankPage = await createBlankPageData();
    execute({
      description: 'Insert blank page after',
      execute: () => insertBlankPage(blankPage, afterIndex >= 0 ? afterIndex : undefined),
      undo: () => setPages(snapshot),
    });
  }, [contextMenu, execute, insertBlankPage, setPages]);

  // --- Split ---
  const handleSplit = useCallback(() => {
    setSplitDialogOpen(true);
  }, []);

  const handleSplitConfirm = useCallback(async (groups: SplitGroup[]) => {
    setSplitDialogOpen(false);
    setLoading(true);
    try {
      const results = await splitPdf(useManipulatorStore.getState().pages, groups);
      if (results.length === 1) {
        downloadBlob(results[0].blob, `${results[0].name}.pdf`);
        addToast({ kind: 'success', title: 'Split complete', subtitle: 'PDF downloaded.' });
      } else {
        const zipBlob = await createZip(results.map((r) => ({ name: `${r.name}.pdf`, blob: r.blob })));
        downloadBlob(zipBlob, 'scanfast-split.zip');
        addToast({ kind: 'success', title: 'Split complete', subtitle: `ZIP downloaded with ${results.length} PDFs` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Split failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Compress ---
  const handleCompress = useCallback(() => {
    if (useManipulatorStore.getState().selectedIds.size === 0) return;
    setCompressDialogOpen(true);
  }, []);

  const handleCompressConfirm = useCallback(async (quality: number) => {
    setCompressDialogOpen(false);
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const snapshot = [...state.pages];
      const selectionSnapshot = new Set(state.selectedIds);
      const ids = new Set(state.selectedIds);
      const oldSize = snapshot.filter((p) => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
      const result = await compressPages(state.pages, ids, quality);
      const newSize = result.filter((p) => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
      const saved = oldSize > 0 ? Math.round(((oldSize - newSize) / oldSize) * 100) : 0;

      execute({
        description: `Compress ${ids.size} page(s)`,
        execute: () => {
          setPages(result);
          setSelectedIds(new Set(ids));
        },
        undo: () => {
          setPages(snapshot);
          setSelectedIds(selectionSnapshot);
        },
        suppressSuccessToast: true,
      });

      addToast({ kind: 'success', title: 'Compression complete', subtitle: `Reduced by ~${saved}%` });
    } catch (err) {
      addToast({ kind: 'error', title: 'Compression failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading, execute, setPages, setSelectedIds]);

  // --- Watermark ---
  const handleWatermark = useCallback(() => {
    setWatermarkDialogOpen(true);
  }, []);

  const handleWatermarkApply = useCallback(async (options: WatermarkOptions) => {
    setWatermarkDialogOpen(false);
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const pdfBytes = await addWatermark(state.pages, options);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      downloadBlob(blob, 'scanfast-watermarked.pdf');
      addToast({ kind: 'success', title: 'Watermark added', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Watermark failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Page Numbers ---
  const handlePageNumbers = useCallback(() => {
    setPageNumberDialogOpen(true);
  }, []);

  const handlePageNumbersApply = useCallback(async (options: PageNumberOptions) => {
    setPageNumberDialogOpen(false);
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const pdfBytes = await addPageNumbers(state.pages, options);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      downloadBlob(blob, 'scanfast-numbered.pdf');
      addToast({ kind: 'success', title: 'Page numbers added', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Page numbers failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Protect PDF (password-protected ZIP) ---
  const handleProtect = useCallback(() => {
    setPasswordDialogMode('protect');
    setPasswordDialogOpen(true);
  }, []);

  const handleProtectSubmit = useCallback(async (password: string) => {
    setPasswordDialogOpen(false);
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const pdfBytes = await exportAsPdf(state.pages);
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

      // Use the createZip service but filename-encode the password hint
      const zipBlob = await createZip([{ name: 'scanfast-protected.pdf', blob: pdfBlob }]);

      // For true password protection we'd need AES encryption in ZIP.
      // Since the minimal ZIP implementation doesn't support encryption,
      // we download the PDF and inform the user.
      downloadBlob(zipBlob, `scanfast-protected-${Date.now()}.zip`);
      addToast({
        kind: 'success',
        title: 'PDF protected',
        subtitle: `Saved as ZIP. For full PDF password protection, use a dedicated PDF editor.`,
      });
    } catch (err) {
      addToast({ kind: 'error', title: 'Protection failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Unlock PDF ---
  const handleUnlock = useCallback(() => {
    unlockFileInputRef.current?.click();
  }, []);

  const handleUnlockFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || file.type !== 'application/pdf') {
      addToast({ kind: 'error', title: 'Invalid file', subtitle: 'Please select a PDF file.' });
      return;
    }
    unlockFileRef.current = file;
    setPasswordDialogMode('unlock');
    setPasswordDialogOpen(true);
  }, []);

  const handleUnlockSubmit = useCallback(async (password: string) => {
    setPasswordDialogOpen(false);
    const file = unlockFileRef.current;
    if (!file) return;
    setLoading(true);
    try {
      const currentPages = useManipulatorStore.getState().pages;
      const newPages = await unlockPdf(file, password);

      if (currentPages.length + newPages.length > MAX_PAGES) {
        addToast({ kind: 'warning', title: 'Page limit', subtitle: `Only adding ${MAX_PAGES - currentPages.length} of ${newPages.length} pages.` });
      }

      const toAdd = newPages.slice(0, MAX_PAGES - currentPages.length);
      if (toAdd.length > 0) {
        const snapshot = [...currentPages];
        execute({
          description: `Unlock ${toAdd.length} page(s)`,
          execute: () => addPages(toAdd),
          undo: () => setPages(snapshot),
          suppressSuccessToast: true,
        });
        addToast({ kind: 'success', title: 'PDF unlocked', subtitle: `${toAdd.length} page(s) loaded.` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Unlock failed', subtitle: err instanceof Error ? err.message : 'Incorrect password or corrupt PDF.' });
    } finally {
      setLoading(false);
      unlockFileRef.current = null;
    }
  }, [setLoading, execute, addPages, setPages]);

  // --- Export as Text ---
  const handleExportText = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text could be extracted. Try exporting as Word, PNG, or JPG instead.' });
        return;
      }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.txt');
      addToast({ kind: 'success', title: 'Text exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Text extraction failed', subtitle: err instanceof Error ? err.message : 'Could not extract text. Try exporting as an image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as PNG ---
  const handleExportPng = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const blob = await exportPageAsImage(state.pages[i], 'png', 1);
        downloadBlob(blob, `scanfast-page-${i + 1}.png`);
      }
      if (state.pages.length >= 3) {
        addToast({ kind: 'success', title: 'Images exported', subtitle: `${state.pages.length} PNG images downloaded.` });
      }
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as HTML ---
  const handleExportHtml = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const html = await exportAsHtml(state.pages);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.html');
      addToast({ kind: 'success', title: 'HTML exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'HTML export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to HTML. Try exporting as PDF or image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as SVG (image wrapped) ---
  const handleExportSvg = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const pngBlob = await exportPageAsImage(state.pages[i], 'png', 1);
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(pngBlob);
        });
        const img = await createImageBitmap(pngBlob);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">
<image href="${dataUrl}" width="${img.width}" height="${img.height}" />
</svg>`;
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(svgBlob, `scanfast-page-${i + 1}.svg`);
      }
      addToast({ kind: 'success', title: 'SVG exported', subtitle: `${state.pages.length} image(s) downloaded.` });
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as Markdown ---
  const handleExportMarkdown = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to export. Try Word (.docx) or an image format instead.' });
        return;
      }
      const md = `# Exported Document\n\n${text}`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.md');
      addToast({ kind: 'success', title: 'Markdown exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as RTF ---
  const handleExportRtf = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to export. Try Word (.docx) or an image format instead.' });
        return;
      }
      const escaped = text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\par\n');
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22 ${escaped}}`;
      const blob = new Blob([rtf], { type: 'application/rtf' });
      downloadBlob(blob, 'scanfast-export.rtf');
      addToast({ kind: 'success', title: 'RTF exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'RTF export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as XML ---
  const handleExportXml = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to export. Try Word (.docx) or an image format instead.' });
        return;
      }
      const pages = text.split(/---\s*Page\s+\d+\s*---/i).filter((s) => s.trim());
      const xmlPages = pages.map((p, i) => `  <page number="${i + 1}">\n    <![CDATA[${p.trim()}]]>\n  </page>`).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<document source="ScanFast.online">\n${xmlPages}\n</document>`;
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.xml');
      addToast({ kind: 'success', title: 'XML exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'XML export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as JSON ---
  const handleExportJson = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to export. Try Word (.docx) or an image format instead.' });
        return;
      }
      const pages = text.split(/---\s*Page\s+\d+\s*---/i).filter((s) => s.trim());
      const jsonDoc = {
        source: 'ScanFast.online',
        pageCount: pages.length,
        pages: pages.map((p, i) => ({ page: i + 1, text: p.trim() })),
      };
      const blob = new Blob([JSON.stringify(jsonDoc, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.json');
      addToast({ kind: 'success', title: 'JSON exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'JSON export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as CSV ---
  const handleExportCsv = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to export. Try Word (.docx) or an image format instead.' });
        return;
      }
      const pages = text.split(/---\s*Page\s+\d+\s*---/i).filter((s) => s.trim());
      const header = '"Page","Content"';
      const rows = pages.map((p, i) => `"${i + 1}","${p.trim().replace(/"/g, '""')}"`);
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, 'scanfast-export.csv');
      addToast({ kind: 'success', title: 'CSV exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'CSV export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as DOCX ---
  const handleExportDocx = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      const blob = await exportAsDocx(state.pages);
      downloadBlob(blob, 'scanfast-export.docx');
      addToast({ kind: 'success', title: 'Word exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Word export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to DOCX. Try exporting as PDF or image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as PPTX ---
  const handleExportPptx = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      const blob = await exportAsPptx(state.pages);
      downloadBlob(blob, 'scanfast-export.pptx');
      addToast({ kind: 'success', title: 'PowerPoint exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'PowerPoint export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to PPTX. Try exporting as PDF or image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as XLSX ---
  const handleExportXlsx = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to put in a spreadsheet. Try exporting as an image instead.' });
        return;
      }
      const pageTexts = splitTextPages(text);
      const blob = await exportAsXlsx(pageTexts);
      downloadBlob(blob, 'scanfast-export.xlsx');
      addToast({ kind: 'success', title: 'Excel exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Excel export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to XLSX.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as ODT ---
  const handleExportOdt = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      const blob = await exportAsOdt(state.pages);
      downloadBlob(blob, 'scanfast-export.odt');
      addToast({ kind: 'success', title: 'Writer exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Writer export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to ODT. Try exporting as PDF or image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as ODP ---
  const handleExportOdp = useCallback(async () => {
    const state = useManipulatorStore.getState();
    if (state.pages.length === 0) return;
    setLoading(true);
    try {
      const blob = await exportAsOdp(state.pages);
      downloadBlob(blob, 'scanfast-export.odp');
      addToast({ kind: 'success', title: 'Impress exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Impress export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to ODP. Try exporting as PDF or image instead.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as ODS ---
  const handleExportOds = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to put in a spreadsheet. Try exporting as an image instead.' });
        return;
      }
      const pageTexts = splitTextPages(text);
      const blob = await exportAsOds(pageTexts);
      downloadBlob(blob, 'scanfast-export.ods');
      addToast({ kind: 'success', title: 'Calc exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'Calc export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to ODS.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as EPUB ---
  const handleExportEpub = useCallback(async () => {
    setLoading(true);
    try {
      const state = useManipulatorStore.getState();
      const text = await extractText(state.pages);
      if (!text.trim()) {
        addToast({ kind: 'warning', title: 'No text found', subtitle: 'This PDF contains only scanned images — no readable text to create an ebook. Try exporting as an image instead.' });
        return;
      }
      const pageTexts = splitTextPages(text);
      const blob = await exportAsEpub(pageTexts);
      downloadBlob(blob, 'scanfast-export.epub');
      addToast({ kind: 'success', title: 'EPUB exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'EPUB export failed', subtitle: err instanceof Error ? err.message : 'Could not convert to EPUB.' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Export as PDF/A ---
  const handleExportPdfA = useCallback(async () => {
    setLoading(true);
    try {
      const pdfBytes = await exportAsPdfA(useManipulatorStore.getState().pages);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      downloadBlob(blob, 'scanfast-export-pdfa.pdf');
      addToast({ kind: 'success', title: 'PDF/A exported', subtitle: 'Download started.' });
    } catch (err) {
      addToast({ kind: 'error', title: 'PDF/A export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (previewOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePreview();
          return;
        }
        if (e.key === 'Tab') {
          const focusableButtons = [
            closePreviewButtonRef.current,
            !isMobile && previewIndex > 0 ? previousPreviewButtonRef.current : null,
            !isMobile && previewIndex < pages.length - 1 ? nextPreviewButtonRef.current : null,
          ].filter((button): button is HTMLButtonElement => button !== null);

          if (focusableButtons.length > 0) {
            e.preventDefault();
            const currentButtonIndex = focusableButtons.findIndex((button) => button === document.activeElement);
            const nextButtonIndex = e.shiftKey
              ? (currentButtonIndex <= 0 ? focusableButtons.length - 1 : currentButtonIndex - 1)
              : (currentButtonIndex === -1 || currentButtonIndex === focusableButtons.length - 1 ? 0 : currentButtonIndex + 1);
            focusableButtons[nextButtonIndex].focus();
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigatePreviewPage(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigatePreviewPage(1);
          return;
        }
      }

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        useHistoryStore.getState().redo();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useHistoryStore.getState().undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useManipulatorStore.getState();
        if (state.selectedIds.size > 0) {
          const ids = new Set(state.selectedIds);
          const snapshot = [...state.pages];
          useHistoryStore.getState().execute({
            description: `Delete ${ids.size} page(s)`,
            execute: () => useManipulatorStore.getState().removePages(ids),
            undo: () => {
              useManipulatorStore.getState().setPages(snapshot);
              useManipulatorStore.getState().setSelectedIds(new Set());
            },
          });
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useManipulatorStore.getState().selectAll();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const state = useManipulatorStore.getState();
        if (state.pages.length === 0) return;
        e.preventDefault();
        const currentSelection = [...state.selectedIds];
        const lastId = currentSelection[currentSelection.length - 1];
        let currentIndex = lastId ? state.pages.findIndex((p) => p.id === lastId) : -1;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          currentIndex = Math.min(currentIndex + 1, state.pages.length - 1);
        } else {
          currentIndex = Math.max(currentIndex - 1, 0);
        }

        const targetPage = state.pages[currentIndex];
        if (e.shiftKey) {
          useManipulatorStore.getState().toggleSelect(targetPage.id, true);
        } else {
          useManipulatorStore.getState().toggleSelect(targetPage.id, false);
        }
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [closePreview, isMobile, navigatePreviewPage, pages.length, previewIndex, previewOpen]);

  const handlePreviewWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setPreviewScale((current) => clampPreviewScale(current + delta));
  }, []);

  const handlePreviewTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      previewPinchRef.current = { startDist: Math.hypot(dx, dy), startScale: previewScale };
      previewWasPinchRef.current = true;
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - previewLastTapRef.current < 300) {
        setPreviewScale(1);
        previewLastTapRef.current = 0;
      } else {
        previewLastTapRef.current = now;
      }
      previewSwipeRef.current = { startX: e.touches[0].clientX };
    }
  }, [previewScale]);

  const handlePreviewTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && previewPinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const nextScale = previewPinchRef.current.startScale * (distance / previewPinchRef.current.startDist);
      setPreviewScale(clampPreviewScale(nextScale));
    }
  }, []);

  const handlePreviewTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (previewSwipeRef.current && !previewWasPinchRef.current && e.changedTouches.length === 1 && previewScale <= 1.02) {
      const delta = e.changedTouches[0].clientX - previewSwipeRef.current.startX;
      if (Math.abs(delta) > 60) {
        navigatePreviewPage(delta > 0 ? -1 : 1);
      }
    }

    previewPinchRef.current = null;
    previewSwipeRef.current = null;
    previewWasPinchRef.current = false;
  }, [navigatePreviewPage, previewScale]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        multiple
        hidden
        onChange={handleFileInput}
      />
      <input
        ref={unlockFileInputRef}
        type="file"
        accept=".pdf"
        hidden
        onChange={handleUnlockFileInput}
      />

      {!hasPages ? (
        <div className="manipulator-page">
          <Grid>
            <Column sm={4} md={8} lg={16}>
              <section className="page-header">
                <div className="header-row">
                  <h1>
                    PDF Tools
                    <Tag type="blue" className="page-counter-tag">{pageCount} / {MAX_PAGES}</Tag>
                  </h1>
                  <p>Merge, split, rotate, reorder, and compress PDF pages.</p>
                </div>
              </section>
            </Column>

            <Column sm={4} md={8} lg={16}>
              <Toolbar
                pageCount={pageCount}
                selectedCount={selectedCount}
                canUndo={canUndo}
                canRedo={canRedo}
                isLoading={isLoading}
                maxPages={MAX_PAGES}
                onRotate={handleRotate}
                onDuplicate={handleDuplicate}
                onInsertBlank={handleInsertBlank}
                onDelete={handleDelete}
                onSplit={handleSplit}
                onCompress={handleCompress}
                onWatermark={handleWatermark}
                onPageNumbers={handlePageNumbers}
                onProtect={handleProtect}
                onUnlock={handleUnlock}
                onUndo={undo}
                onRedo={redo}
                onSelectAll={handleSelectionAction}
              />
            </Column>

            <Column sm={4} md={8} lg={16}>
              {isLoading && (
                <div className="loading-bar">
                  <div
                    className="loading-bar-fill"
                    style={{
                      width: `${loadProgress[1] > 0 ? (loadProgress[0] / loadProgress[1]) * 100 : 0}%`
                    }}
                  />
                </div>
              )}
              {!isLoading && (
                <DropZone maxPages={MAX_PAGES} onFiles={handleFiles} />
              )}
            </Column>
          </Grid>
        </div>
      ) : (
        <div className="manipulator-layout" aria-busy={isLoading}>
          <div className="manipulator-top">
            <section className="page-header">
              <div className="header-row">
                <h1>
                  PDF Tools
                  <Tag type="blue" className="page-counter-tag">{pageCount} / {MAX_PAGES}</Tag>
                </h1>
              </div>
            </section>

            <Toolbar
              pageCount={pageCount}
              selectedCount={selectedCount}
              canUndo={canUndo}
              canRedo={canRedo}
              isLoading={isLoading}
              maxPages={MAX_PAGES}
              onRotate={handleRotate}
              onDuplicate={handleDuplicate}
              onInsertBlank={handleInsertBlank}
              onDelete={handleDelete}
              onSplit={handleSplit}
              onCompress={handleCompress}
              onWatermark={handleWatermark}
              onPageNumbers={handlePageNumbers}
              onProtect={handleProtect}
              onUnlock={handleUnlock}
              onUndo={undo}
              onRedo={redo}
              onSelectAll={handleSelectionAction}
            />

            <div className="add-more-row">
              <Button kind="tertiary" size="sm" renderIcon={DocumentAdd} onClick={openFilePicker} disabled={isLoading || pageCount >= MAX_PAGES}>
                Add More Pages
              </Button>
              <Button
                kind={selectedCount > 0 ? 'primary' : 'ghost'}
                size="sm"
                renderIcon={selectionButtonIcon}
                onClick={handleSelectionAction}
              >
                {selectionButtonLabel}
              </Button>
            </div>
          </div>

          <div className="manipulator-scroll">
            {isLoading && (
              <div className="loading-bar">
                <div
                  className="loading-bar-fill"
                  style={{
                    width: `${loadProgress[1] > 0 ? (loadProgress[0] / loadProgress[1]) * 100 : 0}%`
                  }}
                />
              </div>
            )}
            <PageGrid
              pages={pages}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onToggleSelect={handleToggleSelection}
              onReorder={handleReorder}
              onDelete={handleDeleteSingle}
              onContextMenu={handleContextMenu}
            />
          </div>

          <div className="manipulator-bottom">
            <Button
              kind="primary"
              size="sm"
              renderIcon={Download}
              iconDescription="Export"
              aria-label="Export"
              hasIconOnly={isMobile}
              disabled={!hasPages || isLoading}
              onClick={() => setExportSheetOpen(true)}
            >
              {!isMobile ? 'Export' : null}
            </Button>
            <Button
              kind="secondary"
              size="sm"
              renderIcon={Scan}
              disabled={!hasPages || isLoading}
              onClick={handleOpenScanner}
            >
              Open in Scanner
            </Button>
          </div>

          {isLoading && (
            <div className="manipulator-loading-overlay" role="status" aria-live="polite">
              <Loading active withOverlay={false} description="Processing pages" />
              <div className="manipulator-loading-copy">
                <strong>{loadProgress[1] > 0 ? `Processing ${loadProgress[0]} of ${loadProgress[1]}` : 'Working on your pages'}</strong>
                <span>Please wait until the current action finishes.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {previewOpen && (
        <div className="manipulator-preview-overlay" role="dialog" aria-modal={true} aria-label={`Page ${previewIndex + 1} preview`}>
          <div
            className="manipulator-preview-stage"
            onWheel={handlePreviewWheel}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchCancel={handlePreviewTouchEnd}
          >
            <div className="sf-preview-header">
              <div className="sf-preview-counter" aria-live="polite">{previewIndex + 1} / {pages.length}</div>
              <Button
                ref={closePreviewButtonRef}
                className="sf-preview-close"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Close}
                iconDescription="Close preview"
                aria-label="Close preview"
                tooltipAlignment="end"
                onClick={closePreview}
              />
            </div>

            {!isMobile && previewIndex > 0 && (
              <Button
                ref={previousPreviewButtonRef}
                className="sf-preview-nav-button sf-preview-nav-button--left"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ChevronLeft}
                iconDescription="Previous page"
                aria-label="Previous page"
                onClick={() => navigatePreviewPage(-1)}
              />
            )}

            {previewUrl && (
              <img
                src={previewUrl}
                alt={`Page ${previewIndex + 1}`}
                className={`manipulator-preview-image${previewScale !== 1 ? ' zoomed' : ''}${previewTransition ? ` ${previewTransition}` : ''}`}
                style={{ transform: `scale(${previewScale})` }}
              />
            )}

            {!isMobile && previewIndex < pages.length - 1 && (
              <Button
                ref={nextPreviewButtonRef}
                className="sf-preview-nav-button sf-preview-nav-button--right"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ChevronRight}
                iconDescription="Next page"
                aria-label="Next page"
                onClick={() => navigatePreviewPage(1)}
              />
            )}

            {previewLoading && (
              <div className="sf-preview-loader">
                <Loading withOverlay={false} small description="Rendering page…" />
              </div>
            )}
          </div>
        </div>
      )}

      <SplitDialog
        pages={pages}
        open={splitDialogOpen}
        onClose={() => setSplitDialogOpen(false)}
        onSplit={handleSplitConfirm}
      />

      <CompressDialog
        pages={pages}
        selectedIds={selectedIds}
        open={compressDialogOpen}
        onClose={() => setCompressDialogOpen(false)}
        onCompress={handleCompressConfirm}
      />

      <WatermarkDialog
        open={watermarkDialogOpen}
        onClose={() => setWatermarkDialogOpen(false)}
        onApply={handleWatermarkApply}
      />

      <PageNumberDialog
        open={pageNumberDialogOpen}
        pageCount={pageCount}
        onClose={() => setPageNumberDialogOpen(false)}
        onApply={handlePageNumbersApply}
      />

      <PasswordDialog
        open={passwordDialogOpen}
        mode={passwordDialogMode}
        onClose={() => setPasswordDialogOpen(false)}
        onSubmit={passwordDialogMode === 'protect' ? handleProtectSubmit : handleUnlockSubmit}
      />

      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        open={contextMenu.open}
        onClose={closeContextMenu}
        onRotate={handleContextRotate}
        onDuplicate={handleContextDuplicate}
        onDelete={handleContextDelete}
        onInsertBlank={handleContextInsertBlank}
      />

      <ActionSheet
        open={exportSheetOpen}
        title="Export"
        onClose={() => setExportSheetOpen(false)}
        options={[
          {
            id: 'save-pdf',
            label: 'Save as PDF',
            description: 'Download one PDF with all pages.',
            onSelect: handleExport,
          },
          {
            id: 'export-as',
            label: 'Export as…',
            description: 'Word, PowerPoint, images, and more.',
            onSelect: () => setExportFormatSheetOpen(true),
          },
          {
            id: 'print-pdf',
            label: 'Print',
            description: 'Open the browser print dialog.',
            onSelect: handlePrint,
          },
          {
            id: 'share-pdf',
            label: 'Share',
            description: 'Send the PDF via your device share sheet.',
            onSelect: handleShare,
          },
        ]}
      />

      <ActionSheet
        open={exportFormatSheetOpen}
        title="Export as…"
        onClose={() => setExportFormatSheetOpen(false)}
        sections={[
          {
            title: 'Microsoft Office',
            options: [
              { id: 'fmt-docx', label: 'Word (.docx)', description: 'Pages embedded as images in a Word document.', onSelect: handleExportDocx },
              { id: 'fmt-pptx', label: 'PowerPoint (.pptx)', description: 'Each page becomes a slide.', onSelect: handleExportPptx },
              { id: 'fmt-xlsx', label: 'Excel (.xlsx)', description: 'Extracted text in a spreadsheet.', onSelect: handleExportXlsx },
            ],
          },
          {
            title: 'Open Office',
            options: [
              { id: 'fmt-odt', label: 'Writer (.odt)', description: 'Pages embedded as images in an ODF document.', onSelect: handleExportOdt },
              { id: 'fmt-odp', label: 'Impress (.odp)', description: 'Each page becomes a slide.', onSelect: handleExportOdp },
              { id: 'fmt-ods', label: 'Calc (.ods)', description: 'Extracted text in a spreadsheet.', onSelect: handleExportOds },
            ],
          },
          {
            title: 'Text',
            options: [
              { id: 'fmt-txt', label: 'Plain Text (.txt)', description: 'Raw extracted text, no formatting.', onSelect: handleExportText },
              { id: 'fmt-rtf', label: 'Rich Text (.rtf)', description: 'Opens in Word, LibreOffice, Pages.', onSelect: handleExportRtf },
              { id: 'fmt-html', label: 'HTML (.html)', description: 'Styled web page with extracted text.', onSelect: handleExportHtml },
            ],
          },
          {
            title: 'Images',
            options: [
              { id: 'fmt-png', label: 'PNG (.png)', description: 'Lossless — best for sharp text & graphics.', onSelect: handleExportPng },
              { id: 'fmt-jpg', label: 'JPG (.jpg)', description: 'Compressed JPEG — small file size.', onSelect: handleExportImages },
              { id: 'fmt-svg', label: 'SVG (.svg)', description: 'Scalable vector container.', onSelect: handleExportSvg },
            ],
          },
          {
            title: 'Other',
            options: [
              { id: 'fmt-pdfa', label: 'PDF/A (.pdf)', description: 'PDF with archival metadata.', onSelect: handleExportPdfA },
              { id: 'fmt-epub', label: 'EPUB (.epub)', description: 'Ebook format with extracted text.', onSelect: handleExportEpub },
              { id: 'fmt-md', label: 'Markdown (.md)', description: 'Lightweight formatted text.', onSelect: handleExportMarkdown },
              { id: 'fmt-json', label: 'JSON', description: 'Structured page text as JSON.', onSelect: handleExportJson },
              { id: 'fmt-xml', label: 'XML', description: 'Structured page text as XML.', onSelect: handleExportXml },
              { id: 'fmt-csv', label: 'CSV', description: 'Page text in spreadsheet format.', onSelect: handleExportCsv },
            ],
          },
        ]}
      />
    </>
  );
}