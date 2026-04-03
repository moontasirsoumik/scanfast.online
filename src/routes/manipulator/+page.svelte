<script lang="ts">
	import { Grid, Row, Column, Tag } from 'carbon-components-svelte';
	import { loadFiles, exportAsPdf, splitPdf, compressPages, renderRotatedThumbnail, downloadBlob, createBlankPageData, type PageData } from '$lib/services/pdf';
	import SplitDialog from '$lib/components/manipulator/SplitDialog.svelte';
	import type { SplitGroup } from '$lib/components/manipulator/SplitDialog.svelte';
	import CompressDialog from '$lib/components/manipulator/CompressDialog.svelte';
	import * as store from '$lib/stores/manipulator.svelte';
	import * as history from '$lib/stores/history.svelte';
	import { addToast } from '$lib/stores/toast.svelte';
	import Toolbar from '$lib/components/manipulator/Toolbar.svelte';
	import PageGrid from '$lib/components/manipulator/PageGrid.svelte';
	import DropZone from '$lib/components/manipulator/DropZone.svelte';

	let fileInput: HTMLInputElement | undefined = $state();
	let splitDialogOpen = $state(false);
	let compressDialogOpen = $state(false);

	let pageCount = $derived(store.workspace.pages.length);
	let selectedCount = $derived(store.workspace.selectedIds.size);
	let hasPages = $derived(pageCount > 0);

	// --- File handling ---
	async function handleFiles(files: File[]) {
		store.setLoading(true);
		try {
			// Warn for large files (>50MB)
			for (const f of files) {
				if (f.size > 50 * 1024 * 1024) {
					addToast({ kind: 'warning', title: 'Large file', subtitle: 'Processing may take a moment...' });
					break;
				}
			}

			const newPages = await loadFiles(
				files, store.MAX_PAGES, store.workspace.pages.length,
				(loaded, total) => { store.setLoadProgress(loaded, total); }
			);

			// Check if page limit was hit
			if (store.workspace.pages.length + newPages.length >= store.MAX_PAGES) {
				addToast({ kind: 'warning', title: 'Page limit reached', subtitle: 'Maximum 20 pages per session.' });
			}

			if (newPages.length > 0) {
				const snapshot = [...store.workspace.pages];
				history.execute({
					description: `Add ${newPages.length} page(s)`,
					execute: () => store.addPages(newPages),
					undo: () => { store.setPages(snapshot); },
				});
			}
		} catch (err) {
			addToast({ kind: 'error', title: 'Failed to load file', subtitle: err instanceof Error ? err.message : 'Unknown error' });
		} finally {
			store.setLoading(false);
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		handleFiles(Array.from(input.files));
		input.value = '';
	}

	// --- Rotate ---
	function handleRotate() {
		if (store.workspace.selectedIds.size === 0) return;
		const ids = new Set(store.workspace.selectedIds);
		const snapshot = store.workspace.pages.map(p => ({ ...p }));

		history.execute({
			description: `Rotate ${ids.size} page(s)`,
			execute: () => {
				store.rotatePages(ids);
				Promise.all(
					store.workspace.pages
						.filter(p => ids.has(p.id))
						.map(async (p) => {
							p.thumbnail = await renderRotatedThumbnail(p);
						})
				);
			},
			undo: () => { store.setPages(snapshot); },
		});
	}

	// --- Delete ---
	function handleDelete() {
		if (store.workspace.selectedIds.size === 0) return;
		const ids = new Set(store.workspace.selectedIds);
		const snapshot = [...store.workspace.pages];

		history.execute({
			description: `Delete ${ids.size} page(s)`,
			execute: () => { store.removePages(ids); },
			undo: () => { store.setPages(snapshot); store.setSelectedIds(new Set()); },
		});
	}

	// --- Duplicate ---
	function handleDuplicate() {
		if (store.workspace.selectedIds.size === 0) return;
		const ids = new Set(store.workspace.selectedIds);
		const snapshot = [...store.workspace.pages];

		history.execute({
			description: `Duplicate ${ids.size} page(s)`,
			execute: () => { store.duplicatePages(ids); },
			undo: () => { store.setPages(snapshot); },
		});
	}

	// --- Insert blank page ---
	async function handleInsertBlank() {
		if (store.workspace.pages.length >= store.MAX_PAGES) return;
		const snapshot = [...store.workspace.pages];

		// Insert after the last selected page, or at end
		const selected = [...store.workspace.selectedIds];
		let afterIndex: number | undefined;
		if (selected.length > 0) {
			const indices = selected.map(id => store.workspace.pages.findIndex(p => p.id === id)).filter(i => i !== -1);
			afterIndex = Math.max(...indices);
		}

		const blankPage = await store.insertBlankPage(afterIndex);
		if (!blankPage) return;

		// Record undo as restoring snapshot
		history.state.undoStack = [...history.state.undoStack, {
			description: 'Insert blank page',
			execute: () => { store.insertBlankPage(afterIndex); },
			undo: () => { store.setPages(snapshot); },
		}].slice(-20);
		history.state.redoStack = [];
	}

	// --- Reorder ---
	function handleReorder(newPages: PageData[]) {
		const snapshot = [...store.workspace.pages];
		history.execute({
			description: 'Reorder pages',
			execute: () => { store.reorderPages(newPages); },
			undo: () => { store.setPages(snapshot); },
		});
	}

	// --- Export ---
	async function handleExport() {
		store.setLoading(true);
		try {
			const pdfBytes = await exportAsPdf(store.workspace.pages);
			const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
			downloadBlob(blob, 'scanfast-output.pdf');
			addToast({ kind: 'success', title: 'PDF exported', subtitle: 'Download started.' });
		} catch (err) {
			addToast({ kind: 'error', title: 'Export failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
		} finally {
			store.setLoading(false);
		}
	}

	// --- Print ---
	async function handlePrint() {
		store.setLoading(true);
		try {
			const pdfBytes = await exportAsPdf(store.workspace.pages);
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
			store.setLoading(false);
		}
	}

	// --- Share ---
	async function handleShare() {
		store.setLoading(true);
		try {
			const pdfBytes = await exportAsPdf(store.workspace.pages);
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
			store.setLoading(false);
		}
	}

	// --- Selection ---
	function handleSelect(id: string, e: MouseEvent) {
		if (e.shiftKey) {
			store.selectRange(id);
		} else if (e.ctrlKey || e.metaKey) {
			store.toggleSelect(id, true);
		} else {
			store.toggleSelect(id, false);
		}
	}

	// --- Split ---
	function handleSplit() {
		splitDialogOpen = true;
	}

	async function handleSplitConfirm(groups: SplitGroup[]) {
		splitDialogOpen = false;
		store.setLoading(true);
		try {
			const results = await splitPdf(store.workspace.pages, groups);
			for (const { name, blob } of results) {
				downloadBlob(blob, `${name}.pdf`);
			}
			addToast({ kind: 'success', title: 'Split complete', subtitle: `${results.length} PDFs downloaded.` });
		} catch (err) {
			addToast({ kind: 'error', title: 'Split failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
		} finally {
			store.setLoading(false);
		}
	}

	// --- Compress ---
	function handleCompress() {
		if (store.workspace.selectedIds.size === 0) return;
		compressDialogOpen = true;
	}

	async function handleCompressConfirm(quality: number) {
		compressDialogOpen = false;
		store.setLoading(true);
		try {
			const snapshot = [...store.workspace.pages];
			const ids = new Set(store.workspace.selectedIds);
			const oldSize = snapshot.filter(p => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
			const result = await compressPages(store.workspace.pages, ids, quality);
			const newSize = result.filter(p => ids.has(p.id)).reduce((s, p) => s + p.data.byteLength, 0);
			const saved = oldSize > 0 ? Math.round(((oldSize - newSize) / oldSize) * 100) : 0;

			history.execute({
				description: `Compress ${ids.size} page(s)`,
				execute: () => { store.setPages(result); },
				undo: () => { store.setPages(snapshot); },
			});

			addToast({ kind: 'success', title: 'Compression complete', subtitle: `Reduced by ~${saved}%` });
		} catch (err) {
			addToast({ kind: 'error', title: 'Compression failed', subtitle: err instanceof Error ? err.message : 'Unknown error' });
		} finally {
			store.setLoading(false);
		}
	}

	// --- Keyboard shortcuts ---
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
			e.preventDefault();
			history.redo();
		} else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			history.undo();
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (store.workspace.selectedIds.size > 0) handleDelete();
		} else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			store.selectAll();
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (store.workspace.pages.length === 0) return;
			e.preventDefault();
			const pages = store.workspace.pages;
			const currentSelection = [...store.workspace.selectedIds];
			const lastId = currentSelection[currentSelection.length - 1];
			let currentIndex = lastId ? pages.findIndex(p => p.id === lastId) : -1;

			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				currentIndex = Math.min(currentIndex + 1, pages.length - 1);
			} else {
				currentIndex = Math.max(currentIndex - 1, 0);
			}

			const targetPage = pages[currentIndex];
			if (e.shiftKey) {
				store.toggleSelect(targetPage.id, true);
			} else {
				store.toggleSelect(targetPage.id, false);
			}
		}
	}
</script>

<svelte:head>
	<title>PDF Manipulator — ScanFast</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<input
	bind:this={fileInput}
	type="file"
	accept=".pdf,.jpg,.jpeg,.png,.webp"
	multiple
	hidden
	onchange={handleFileInput}
/>

<div class="manipulator-page">
	<Grid>
		<Row>
			<Column sm={4} md={8} lg={16}>
				<section class="page-header">
					<div class="header-row">
						<div>
							<h1>PDF Manipulator</h1>
							<p>Merge, split, rotate, reorder, and compress PDF pages.</p>
						</div>
						<span aria-live="polite"><Tag type="blue">{pageCount} / {store.MAX_PAGES} pages</Tag></span>
					</div>
				</section>
			</Column>
		</Row>

		<Row>
			<Column sm={4} md={8} lg={16}>
				<Toolbar
					{pageCount}
					{selectedCount}
					canUndo={history.state.canUndo}
					canRedo={history.state.canRedo}
					isLoading={store.workspace.isLoading}
					maxPages={store.MAX_PAGES}
					onadd={openFilePicker}
					onrotate={handleRotate}
					onduplicate={handleDuplicate}
					oninsertblank={handleInsertBlank}
					ondelete={handleDelete}
					onsplit={handleSplit}
					oncompress={handleCompress}
					onundo={() => history.undo()}
					onredo={() => history.redo()}
					onexport={handleExport}
					onprint={handlePrint}
					onshare={handleShare}
					onselectall={() => store.selectAll()}
				/>
			</Column>
		</Row>

		<Row>
			<Column sm={4} md={8} lg={16}>
				{#if store.workspace.isLoading}
					<div class="loading-bar">
						<div
							class="loading-bar-fill"
							style="width: {store.workspace.loadProgress[1] > 0 ? (store.workspace.loadProgress[0] / store.workspace.loadProgress[1]) * 100 : 0}%"
						></div>
					</div>
				{/if}

				{#if !hasPages && !store.workspace.isLoading}
					<DropZone maxPages={store.MAX_PAGES} onfiles={handleFiles} />
				{:else if hasPages}
					<PageGrid
						pages={store.workspace.pages}
						selectedIds={store.workspace.selectedIds}
						onselect={handleSelect}
						onreorder={handleReorder}
						onlongpress={(id) => store.toggleSelect(id, true)}
					/>
					<DropZone maxPages={store.MAX_PAGES} onfiles={handleFiles} />
				{/if}
			</Column>
		</Row>
	</Grid>
</div>

<SplitDialog
	pages={store.workspace.pages}
	open={splitDialogOpen}
	onclose={() => { splitDialogOpen = false; }}
	onsplit={handleSplitConfirm}
/>

<CompressDialog
	pages={store.workspace.pages}
	selectedIds={store.workspace.selectedIds}
	open={compressDialogOpen}
	onclose={() => { compressDialogOpen = false; }}
	oncompress={handleCompressConfirm}
/>

<style>
	.manipulator-page {
		max-width: 1312px;
		margin: 0 auto;
	}

	.page-header {
		padding: 32px 0 16px;
	}

	.header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.page-header h1 {
		font-family: var(--sf-font-heading);
		font-size: 1.75rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0 0 8px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.page-header p {
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0;
	}

	.loading-bar {
		margin-top: 16px;
		height: 4px;
		background: var(--cds-layer-02, #1a1a1a);
		border-radius: 2px;
		overflow: hidden;
	}

	.loading-bar-fill {
		height: 100%;
		background: var(--cds-interactive, #0f62fe);
		transition: width 0.3s ease;
		min-width: 4%;
	}

	@media (max-width: 671px) {
		.page-header h1 {
			font-size: 1.25rem;
		}
	}
</style>
