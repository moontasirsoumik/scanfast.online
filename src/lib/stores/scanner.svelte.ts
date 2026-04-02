/** @module Scanner store — in-memory state for the document scanning workflow. */

/** Rectangular crop bounds, normalized 0–1 */
export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Available image filter types */
export type FilterType = 'original' | 'enhance' | 'bw' | 'grayscale' | 'sharpen';

/** Scanner workflow view states */
export type ScannerView = 'idle' | 'camera' | 'preview' | 'gallery';

/** A single scanned page with original and processed data */
export interface ScannedPage {
	id: string;
	originalBlob: Blob;
	processedDataUrl: string;
	thumbnail: string;
	filter: FilterType;
	rotation: number;
	cropRect: CropRect | null;
}

/** Max pages per scanning session */
export const MAX_PAGES = 20;

/** Scanner workflow state */
class ScannerState {
	view = $state<ScannerView>('idle');
	pages = $state<ScannedPage[]>([]);
	currentImage = $state<Blob | null>(null);
	currentFilter = $state<FilterType>('original');
	currentRotation = $state<number>(0);
	currentCrop = $state<CropRect | null>(null);
	editingPageId = $state<string | null>(null);
	isProcessing = $state(false);
	cameraFacing = $state<'user' | 'environment'>('environment');
}

/** Singleton scanner state instance */
export const scanner = new ScannerState();

/** Set the current scanner view */
export function setView(view: ScannerView): void {
	scanner.view = view;
}

/** Capture an image blob and transition to preview */
export function captureImage(blob: Blob): void {
	scanner.currentImage = blob;
	scanner.currentFilter = 'original';
	scanner.currentRotation = 0;
	scanner.currentCrop = null;
	scanner.editingPageId = null;
	scanner.view = 'preview';
}

/** Set the active filter */
export function setFilter(filter: FilterType): void {
	scanner.currentFilter = filter;
}

/** Set the rotation in degrees (0, 90, 180, 270) */
export function setRotation(degrees: number): void {
	scanner.currentRotation = ((degrees % 360) + 360) % 360;
}

/** Set or clear the crop rectangle */
export function setCrop(rect: CropRect | null): void {
	scanner.currentCrop = rect;
}

/** Add a scanned page, enforcing the 20-page limit */
export function addPage(page: ScannedPage): boolean {
	if (scanner.pages.length >= MAX_PAGES) return false;
	scanner.pages = [...scanner.pages, page];
	return true;
}

/** Remove a page by ID */
export function removePage(id: string): void {
	scanner.pages = scanner.pages.filter((p) => p.id !== id);
}

/** Load an existing page into preview for re-editing */
export function editPage(id: string): void {
	const page = scanner.pages.find((p) => p.id === id);
	if (!page) return;

	scanner.currentImage = page.originalBlob;
	scanner.currentFilter = page.filter;
	scanner.currentRotation = page.rotation;
	scanner.currentCrop = page.cropRect;
	scanner.editingPageId = id;
	scanner.view = 'preview';
}

/** Save current edits — updates existing page or adds new */
export function savePage(processedDataUrl: string, thumbnail: string): void {
	if (!scanner.currentImage) return;

	const pageData: ScannedPage = {
		id: scanner.editingPageId ?? crypto.randomUUID(),
		originalBlob: scanner.currentImage,
		processedDataUrl,
		thumbnail,
		filter: scanner.currentFilter,
		rotation: scanner.currentRotation,
		cropRect: scanner.currentCrop
	};

	if (scanner.editingPageId) {
		scanner.pages = scanner.pages.map((p) => (p.id === scanner.editingPageId ? pageData : p));
	} else {
		if (scanner.pages.length >= MAX_PAGES) return;
		scanner.pages = [...scanner.pages, pageData];
	}

	resetPreview();
	scanner.view = scanner.pages.length > 0 ? 'gallery' : 'idle';
}

/** Reorder pages */
export function reorderPages(newOrder: ScannedPage[]): void {
	scanner.pages = newOrder;
}

/** Reset the entire scanner state */
export function resetScanner(): void {
	scanner.view = 'idle';
	scanner.pages = [];
	scanner.currentImage = null;
	scanner.currentFilter = 'original';
	scanner.currentRotation = 0;
	scanner.currentCrop = null;
	scanner.editingPageId = null;
	scanner.isProcessing = false;
	scanner.cameraFacing = 'environment';
}

/** Clear preview fields and go back */
export function resetPreview(): void {
	scanner.currentImage = null;
	scanner.currentFilter = 'original';
	scanner.currentRotation = 0;
	scanner.currentCrop = null;
	scanner.editingPageId = null;
	scanner.isProcessing = false;
}
