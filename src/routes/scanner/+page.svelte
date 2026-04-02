<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Loading } from 'carbon-components-svelte';
	import ScanIcon from 'carbon-icons-svelte/lib/Scan.svelte';
	import ImageIcon from 'carbon-icons-svelte/lib/Image.svelte';
	import DocumentPdfIcon from 'carbon-icons-svelte/lib/DocumentPdf.svelte';
	import Add from 'carbon-icons-svelte/lib/Add.svelte';
	import Crop from 'carbon-icons-svelte/lib/Crop.svelte';
	import Undo from 'carbon-icons-svelte/lib/Undo.svelte';
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';

	import CameraView from '$lib/components/scanner/CameraView.svelte';
	import CropEditor from '$lib/components/scanner/CropEditor.svelte';
	import FilterBar from '$lib/components/scanner/FilterBar.svelte';
	import RotationControls from '$lib/components/scanner/RotationControls.svelte';
	import PageGallery from '$lib/components/scanner/PageGallery.svelte';

	import {
		scanner,
		setView,
		captureImage,
		setFilter,
		setRotation,
		setCrop,
		savePage,
		editPage,
		removePage,
		resetPreview,
		MAX_PAGES
	} from '$lib/stores/scanner.svelte';
	import { addToast } from '$lib/stores/toast.svelte';
	import { processPage } from '$lib/services/filters';
	import { downloadBlob, loadFiles } from '$lib/services/pdf';

	/** Tracks where user came from before entering preview */
	let cameFromCamera = $state(false);

	/** Live-processed preview data URL */
	let previewUrl = $state('');

	/** Whether crop editor overlay is showing */
	let cropMode = $state(false);

	/** Hidden file input ref */
	let fileInput = $state<HTMLInputElement | null>(null);

	/** Object URL for crop editor (unprocessed, just the raw blob) */
	let rawImageUrl = $state('');

	// --- Live preview processing ---
	$effect(() => {
		const img = scanner.currentImage;
		const filter = scanner.currentFilter;
		const rotation = scanner.currentRotation;
		const crop = scanner.currentCrop;
		if (!img) {
			previewUrl = '';
			return;
		}
		scanner.isProcessing = true;
		processPage(img, filter, rotation, crop).then((result) => {
			previewUrl = result.dataUrl;
			scanner.isProcessing = false;
		});
	});

	// Keep a raw object URL for the crop editor
	$effect(() => {
		const img = scanner.currentImage;
		if (img) {
			const url = URL.createObjectURL(img);
			rawImageUrl = url;
			return () => URL.revokeObjectURL(url);
		} else {
			rawImageUrl = '';
		}
	});

	// --- Handlers ---

	function handleCapture(blob: Blob) {
		cameFromCamera = true;
		captureImage(blob);
	}

	function handleCameraClose() {
		setView(scanner.pages.length > 0 ? 'gallery' : 'idle');
	}

	function handleImportClick() {
		fileInput?.click();
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			cameFromCamera = false;
			captureImage(file);
		}
		input.value = '';
	}

	async function handleSavePage() {
		if (!scanner.currentImage) return;
		if (!scanner.editingPageId && scanner.pages.length >= MAX_PAGES) {
			addToast({ kind: 'warning', title: 'Page limit reached', subtitle: 'Maximum 20 pages per session.' });
			return;
		}
		scanner.isProcessing = true;
		try {
			const result = await processPage(
				scanner.currentImage,
				scanner.currentFilter,
				scanner.currentRotation,
				scanner.currentCrop
			);
			savePage(result.dataUrl, result.thumbnail);
			cropMode = false;
		} catch (err) {
			addToast({ kind: 'error', title: 'Failed to save page', subtitle: err instanceof Error ? err.message : 'Unknown error' });
		} finally {
			scanner.isProcessing = false;
		}
	}

	function handleRetake() {
		cropMode = false;
		resetPreview();
		setView(cameFromCamera ? 'camera' : 'idle');
	}

	function handleToggleCrop() {
		cropMode = !cropMode;
	}

	function handleCropConfirm() {
		cropMode = false;
	}

	function handleCropCancel() {
		setCrop(null);
		cropMode = false;
	}

	function handleEditPage(id: string) {
		cameFromCamera = false;
		editPage(id);
	}

	function handleDeletePage(id: string) {
		removePage(id);
		if (scanner.pages.length === 0) {
			setView('idle');
		}
	}

	async function handleExport() {
		if (scanner.pages.length === 0) return;
		scanner.isProcessing = true;
		try {
			const { PDFDocument } = await import('pdf-lib');
			const pdfDoc = await PDFDocument.create();

			for (const page of scanner.pages) {
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
			scanner.isProcessing = false;
		}
	}

	async function handleOpenManipulator() {
		if (scanner.pages.length === 0) return;
		scanner.isProcessing = true;
		try {
			const manipStore = await import('$lib/stores/manipulator.svelte');

			const files: File[] = [];
			for (const page of scanner.pages) {
				const resp = await fetch(page.processedDataUrl);
				const blob = await resp.blob();
				files.push(new File([blob], `scan-${page.id}.jpg`, { type: 'image/jpeg' }));
			}

			manipStore.setLoading(true);
			const pageData = await loadFiles(files, 20, 0);
			manipStore.addPages(pageData);
			manipStore.setLoading(false);

			goto('/manipulator');
		} finally {
			scanner.isProcessing = false;
		}
	}

	function handleScanMore() {
		setView('camera');
	}
</script>

<svelte:head>
	<title>Scanner — ScanFast</title>
</svelte:head>

<!-- Hidden file input for gallery import -->
<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	class="hidden-input"
	onchange={handleFileChange}
/>

{#if scanner.view === 'camera'}
	<!-- Full-screen camera -->
	<CameraView onCapture={handleCapture} onClose={handleCameraClose} />
{:else}
	<div class="scanner-page">
		{#if scanner.view === 'idle'}
			<!-- Landing view -->
			<section class="page-header">
				<h1>Scanner</h1>
				<p>Scan documents with your camera or import images from gallery.</p>
			</section>

			<div class="action-cards">
				<button class="action-card" onclick={() => setView('camera')}>
					<div class="action-icon"><ScanIcon size={24} /></div>
					<div class="action-text">
						<strong>Scan with Camera</strong>
						<span>Auto-detect document edges, crop, and enhance</span>
					</div>
				</button>

				<button class="action-card" onclick={handleImportClick}>
					<div class="action-icon"><ImageIcon size={24} /></div>
					<div class="action-text">
						<strong>Import from Gallery</strong>
						<span>Load images and process them as scanned documents</span>
					</div>
				</button>
			</div>

			{#if scanner.pages.length > 0}
				<section class="gallery-section">
					<PageGallery
						pages={scanner.pages}
						maxPages={MAX_PAGES}
						onedit={handleEditPage}
						ondelete={handleDeletePage}
						onexport={handleExport}
						onmanipulator={handleOpenManipulator}
					/>
				</section>
			{:else}
				<div class="empty-gallery">
					<DocumentPdfIcon size={48} />
					<p>No scanned pages yet</p>
					<span>Scan or import images to get started. Up to {MAX_PAGES} pages per session.</span>
				</div>
			{/if}

		{:else if scanner.view === 'preview'}
			<!-- Preview / edit view -->
			<section class="page-header compact">
				<h1>Preview</h1>
			</section>

			<div class="preview-container">
				{#if previewUrl}
					<img src={previewUrl} alt="Preview" class="preview-image" />
				{:else}
					<div class="preview-loading">
						<Loading withOverlay={false} small />
					</div>
				{/if}

				{#if cropMode && rawImageUrl}
					<div class="crop-overlay">
						<CropEditor
							imageUrl={rawImageUrl}
							initialCrop={scanner.currentCrop}
							onchange={(crop) => setCrop(crop)}
							onconfirm={handleCropConfirm}
							oncancel={handleCropCancel}
						/>
					</div>
				{/if}
			</div>

			<div class="preview-controls">
				<RotationControls
					rotation={scanner.currentRotation}
					onrotate={(deg) => setRotation(deg)}
				/>

				{#if scanner.currentImage}
					<FilterBar
						sourceBlob={scanner.currentImage}
						activeFilter={scanner.currentFilter}
						onselect={(f) => setFilter(f)}
					/>
				{/if}
			</div>

			<div class="preview-toolbar">
				<Button kind="ghost" size="small" icon={Undo} on:click={handleRetake}>
					{cameFromCamera ? 'Retake' : 'Back'}
				</Button>
				<Button
					kind="ghost"
					size="small"
					icon={Crop}
					on:click={handleToggleCrop}
				>
					{cropMode ? 'Cancel Crop' : 'Crop'}
				</Button>
				<Button
					kind="primary"
					size="small"
					icon={Checkmark}
					disabled={scanner.isProcessing || !previewUrl}
					on:click={handleSavePage}
				>
					Add Page
				</Button>
			</div>

		{:else if scanner.view === 'gallery'}
			<!-- Gallery view -->
			<section class="page-header compact">
				<h1>Scanned Pages</h1>
				<p>{scanner.pages.length} / {MAX_PAGES} pages</p>
			</section>

			<div class="gallery-actions">
				<Button kind="tertiary" size="small" icon={ScanIcon} on:click={handleScanMore}>
					Scan More
				</Button>
				<Button kind="ghost" size="small" icon={Add} on:click={handleImportClick}>
					Import More
				</Button>
			</div>

			<section class="gallery-section">
				<PageGallery
					pages={scanner.pages}
					maxPages={MAX_PAGES}
					onedit={handleEditPage}
					ondelete={handleDeletePage}
					onexport={handleExport}
					onmanipulator={handleOpenManipulator}
				/>
			</section>
		{/if}
	</div>
{/if}

{#if scanner.isProcessing}
	<div class="processing-overlay">
		<Loading withOverlay={false} small description="Processing…" />
	</div>
{/if}

<style>
	.hidden-input {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
	}

	.scanner-page {
		max-width: 1312px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	/* --- Page Header --- */
	.page-header {
		padding: 2rem 0 1.5rem;
	}

	.page-header.compact {
		padding: 1rem 0 0.75rem;
	}

	.page-header h1 {
		font-family: var(--sf-font-heading);
		font-size: 1.75rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.page-header p {
		font-size: 0.875rem;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0;
	}

	/* --- Action Cards (idle) --- */
	.action-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	@media (min-width: 672px) {
		.action-cards {
			grid-template-columns: 1fr 1fr;
		}
	}

	.action-card {
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md, 12px);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font: inherit;
		transition: border-color 110ms;
		-webkit-tap-highlight-color: transparent;
	}

	.action-card:hover,
	.action-card:focus-visible {
		border-color: var(--cds-interactive, #0f62fe);
		outline: none;
	}

	.action-icon {
		color: var(--cds-interactive, #0f62fe);
	}

	.action-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.action-text strong {
		font-size: 0.875rem;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.action-text span {
		font-size: 0.8125rem;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	/* --- Empty Gallery --- */
	.empty-gallery {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		text-align: center;
		color: var(--cds-text-placeholder, #6f6f6f);
		border: 1px dashed var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md, 12px);
	}

	.empty-gallery p {
		font-size: 1rem;
		margin: 1rem 0 0.25rem;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	.empty-gallery span {
		font-size: 0.8125rem;
		color: var(--cds-text-placeholder, #6f6f6f);
	}

	/* --- Preview View --- */
	.preview-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md, 12px) var(--sf-radius-md, 12px) 0 0;
		min-height: 40vh;
		max-height: 55vh;
		overflow: hidden;
	}

	.preview-image {
		max-width: 100%;
		max-height: 50vh;
		object-fit: contain;
		display: block;
	}

	.preview-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem;
	}

	.crop-overlay {
		position: absolute;
		inset: 0;
		z-index: 10;
	}

	.preview-controls {
		display: flex;
		flex-direction: column;
		gap: 0;
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-top: none;
		border-radius: 0 0 var(--sf-radius-md, 12px) var(--sf-radius-md, 12px);
	}

	.preview-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.75rem 0.5rem;
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-top: none;
		flex-wrap: wrap;
	}

	/* --- Gallery View --- */
	.gallery-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.gallery-section {
		margin-top: 0.5rem;
	}

	/* --- Processing Overlay --- */
	.processing-overlay {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		z-index: 100;
		background: var(--cds-layer-02, #1a1a1a);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-sm, 8px);
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
