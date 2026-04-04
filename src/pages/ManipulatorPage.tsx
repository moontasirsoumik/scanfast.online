import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Column, Tag, Button } from '@carbon/react';
import { DocumentAdd, Download, Scan, CheckboxCheckedFilled, Checkbox } from '@carbon/icons-react';
import { useManipulatorStore, MAX_PAGES } from '@/stores/manipulator';
import { useHistoryStore } from '@/stores/history';
import { useScannerStore, type ScannedPage } from '@/stores/scanner';
import { addToast } from '@/stores/toast';
import {
  loadFiles,
  exportAsPdf,
  exportPageAsImage,
  splitPdf,
  compressPages,
  renderRotatedThumbnail,
  downloadBlob,
  createBlankPageData,
  type PageData
} from '@/services/pdf';
import { createZip } from '@/services/zip';
import { processPage } from '@/services/filters';
import Toolbar from '@/components/manipulator/Toolbar';
import PageGrid from '@/components/manipulator/PageGrid';
import DropZone from '@/components/manipulator/DropZone';
import SplitDialog from '@/components/manipulator/SplitDialog';
import CompressDialog from '@/components/manipulator/CompressDialog';
import ContextMenu from '@/components/manipulator/ContextMenu';
import ActionSheet from '@/components/shared/ActionSheet';
import useIsMobile from '@/hooks/useIsMobile';
import './ManipulatorPage.css';

/** SplitGroup type for split dialog */
export interface SplitGroup {
  name: string;
  pageIndices: number[];
}

/** PDF Manipulator page — merge, split, rotate, reorder, compress */
export default function ManipulatorPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [compressDialogOpen, setCompressDialogOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number; pageId: string }>({ open: false, x: 0, y: 0, pageId: '' });
  const [selectMode, setSelectMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    document.title = 'PDF Tools — ScanFastOnline';
  }, []);

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
          cropRect: null
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
  const handleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (selectMode) {
      toggleSelect(id, true);
      return;
    }
    if (e.shiftKey) {
      selectRange(id);
    } else if (e.ctrlKey || e.metaKey) {
      toggleSelect(id, true);
    } else {
      toggleSelect(id, false);
    }
  }, [selectRange, toggleSelect, selectMode]);

  const handleToggleSelectMode = useCallback(() => {
    if (selectMode) {
      clearSelection();
    }
    setSelectMode((prev) => !prev);
  }, [selectMode, clearSelection]);

  // Exit select mode when selection is cleared externally
  useEffect(() => {
    if (selectMode && selectedIds.size === 0) {
      // Keep select mode on — user may want to select more
    }
  }, [selectMode, selectedIds.size]);

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
      const ids = new Set(state.selectedIds);
      const oldSize = snapshot.filter((p) => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
      const result = await compressPages(state.pages, ids, quality);
      const newSize = result.filter((p) => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
      const saved = oldSize > 0 ? Math.round(((oldSize - newSize) / oldSize) * 100) : 0;

      execute({
        description: `Compress ${ids.size} page(s)`,
        execute: () => setPages(result),
        undo: () => setPages(snapshot),
      });

      addToast({ kind: 'success', title: 'Compression complete', subtitle: `Reduced by ~${saved}%` });
    } catch (err) {
      addToast({ kind: 'error', title: 'Compression failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [setLoading, execute, setPages]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
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
  }, []);

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
                onUndo={undo}
                onRedo={redo}
                onSelectAll={selectAll}
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
        <div className="manipulator-layout">
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
              onUndo={undo}
              onRedo={redo}
              onSelectAll={selectAll}
            />

            <div className="add-more-row">
              <Button kind="tertiary" size="sm" renderIcon={DocumentAdd} onClick={openFilePicker} disabled={isLoading || pageCount >= MAX_PAGES}>
                Add More Pages
              </Button>
              <Button
                kind={selectMode ? 'primary' : 'ghost'}
                size="sm"
                renderIcon={selectMode ? CheckboxCheckedFilled : Checkbox}
                onClick={handleToggleSelectMode}
              >
                {selectMode ? `${selectedCount} Selected` : 'Select'}
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
              selectMode={selectMode}
              onSelect={handleSelect}
              onReorder={handleReorder}
              onDelete={handleDeleteSingle}
              onLongPress={(id: string) => { if (!selectMode) { setSelectMode(true); toggleSelect(id, true); } }}
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
        title="Export PDF"
        onClose={() => setExportSheetOpen(false)}
        options={[
          {
            id: 'save-pdf',
            label: 'Save as PDF',
            description: 'Download one PDF file with all pages.',
            onSelect: handleExport,
          },
          {
            id: 'export-jpg',
            label: 'Export as JPG files',
            description: 'Download each page as its own image.',
            onSelect: handleExportImages,
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
            description: 'Use your device share menu if available.',
            onSelect: handleShare,
          },
        ]}
      />
    </>
  );
}
