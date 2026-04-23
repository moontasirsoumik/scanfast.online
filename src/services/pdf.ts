import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

/** Lazy-loaded pdfjs-dist (browser-only, avoids SSR DOMMatrix error) */
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
	if (!pdfjsLib) {
		pdfjsLib = await import('pdfjs-dist');
		pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
	}
	return pdfjsLib;
}

/** Represents a single page in the workspace */
export interface PageData {
	/** Unique ID for this page */
	id: string;
	/** Thumbnail as data URL (JPEG, ~200px wide) */
	thumbnail: string;
	/** Original source: 'pdf' or 'image' */
	sourceType: 'pdf' | 'image';
	/** Source file name */
	sourceFile: string;
	/** Page index within source PDF (0-based), -1 for images */
	sourcePageIndex: number;
	/** Rotation in degrees (0, 90, 180, 270) */
	rotation: number;
	/** Original page bytes for PDF pages, or image bytes for images */
	data: Uint8Array;
	/** Width of original page in points */
	width: number;
	/** Height of original page in points */
	height: number;
}

/** Generate a unique page ID */
export function generatePageId(): string {
	return crypto.randomUUID();
}

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(blob);
	try {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = reject;
			image.src = url;
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: 'image/jpeg' | 'image/png',
	quality?: number
): Promise<Blob> {
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob!), type, quality);
	});
}

async function addImagePageToPdf(outDoc: PDFDocument, page: PageData): Promise<void> {
	const sourceMime = getMimeFromBytes(page.data);
	const canEmbedWithoutRerender = page.rotation === 0 && (sourceMime === 'image/jpeg' || sourceMime === 'image/png');

	if (canEmbedWithoutRerender) {
		const embedded = sourceMime === 'image/png'
			? await outDoc.embedPng(page.data)
			: await outDoc.embedJpg(page.data);
		const pdfPage = outDoc.addPage([embedded.width, embedded.height]);
		pdfPage.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
		return;
	}

	const sourceBytes = page.data.slice();
	const sourceBlob = new Blob([sourceBytes.buffer], { type: sourceMime });
	const img = await loadImageElement(sourceBlob);
	const isRotated90 = page.rotation === 90 || page.rotation === 270;
	const dstW = isRotated90 ? img.height : img.width;
	const dstH = isRotated90 ? img.width : img.height;

	const canvas = document.createElement('canvas');
	canvas.width = dstW;
	canvas.height = dstH;
	const ctx = canvas.getContext('2d')!;
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate((page.rotation * Math.PI) / 180);
	ctx.drawImage(img, -img.width / 2, -img.height / 2);

	const exportMime: 'image/jpeg' | 'image/png' = sourceMime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
	const exportBlob = await canvasToBlob(canvas, exportMime, exportMime === 'image/jpeg' ? 0.98 : undefined);
	const exportBytes = new Uint8Array(await exportBlob.arrayBuffer());
	const embedded = exportMime === 'image/png'
		? await outDoc.embedPng(exportBytes)
		: await outDoc.embedJpg(exportBytes);
	const pdfPage = outDoc.addPage([dstW, dstH]);
	pdfPage.drawImage(embedded, { x: 0, y: 0, width: dstW, height: dstH });
}

/**
 * Load a PDF file and extract pages with thumbnails.
 * @param file - The PDF file to load
 * @param thumbnailWidth - Width of thumbnail in pixels (default 200)
 * @returns Array of PageData objects
 */
export async function loadPdfPages(file: File, thumbnailWidth = 200): Promise<PageData[]> {
	const arrayBuffer = await file.arrayBuffer();
	const uint8 = new Uint8Array(arrayBuffer);

	const pdfjs = await getPdfjs();
	const pdfDoc = await pdfjs.getDocument({ data: uint8.slice() }).promise;
	const pages: PageData[] = [];

	for (let i = 0; i < pdfDoc.numPages; i++) {
		const page = await pdfDoc.getPage(i + 1);
		const viewport = page.getViewport({ scale: 1 });
		const scale = thumbnailWidth / viewport.width;
		const scaledViewport = page.getViewport({ scale });

		const canvas = document.createElement('canvas');
		canvas.width = scaledViewport.width;
		canvas.height = scaledViewport.height;
		await page.render({ canvas, viewport: scaledViewport }).promise;
		const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

		pages.push({
			id: generatePageId(),
			thumbnail,
			sourceType: 'pdf',
			sourceFile: file.name,
			sourcePageIndex: i,
			rotation: 0,
			data: uint8, // Share the full PDF bytes (pages extracted on export)
			width: viewport.width,
			height: viewport.height
		});

		page.cleanup();
	}

	pdfDoc.destroy();
	return pages;
}

/**
 * Load an image file as a page.
 * @param file - The image file to load
 * @param thumbnailWidth - Width of thumbnail in pixels (default 200)
 * @returns A single PageData object
 */
export async function loadImagePage(file: File, thumbnailWidth = 200): Promise<PageData> {
	const arrayBuffer = await file.arrayBuffer();
	const uint8 = new Uint8Array(arrayBuffer);

	const blob = new Blob([uint8], { type: file.type });
	const url = URL.createObjectURL(blob);
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = reject;
		image.src = url;
	});

	const scale = thumbnailWidth / img.width;
	const canvas = document.createElement('canvas');
	canvas.width = thumbnailWidth;
	canvas.height = img.height * scale;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

	URL.revokeObjectURL(url);

	return {
		id: generatePageId(),
		thumbnail,
		sourceType: 'image',
		sourceFile: file.name,
		sourcePageIndex: -1,
		rotation: 0,
		data: uint8,
		width: img.width,
		height: img.height
	};
}

/**
 * Load files (PDF or images) and return PageData arrays.
 * Respects the max page limit.
 */
export async function loadFiles(
	files: File[],
	maxPages: number,
	currentCount: number,
	onProgress?: (loaded: number, total: number) => void
): Promise<PageData[]> {
	const remaining = maxPages - currentCount;
	if (remaining <= 0) return [];

	const allPages: PageData[] = [];
	let fileIndex = 0;

	for (const file of files) {
		if (allPages.length >= remaining) break;

		try {
			if (file.type === 'application/pdf') {
				const pages = await loadPdfPages(file);
				const toAdd = pages.slice(0, remaining - allPages.length);
				allPages.push(...toAdd);
			} else if (file.type.startsWith('image/')) {
				if (allPages.length < remaining) {
					const page = await loadImagePage(file);
					allPages.push(page);
				}
			}
		} catch (err) {
			console.error(`Failed to load ${file.name}:`, err);
		}

		fileIndex++;
		onProgress?.(fileIndex, files.length);
	}

	return allPages;
}

/**
 * Re-render a page thumbnail with rotation applied.
 */
export async function renderRotatedThumbnail(
	page: PageData,
	thumbnailWidth = 200
): Promise<string> {
	if (page.sourceType === 'pdf') {
		const pdfjs = await getPdfjs();
		const pdfDoc = await pdfjs.getDocument({ data: page.data.slice() }).promise;
		const pdfPage = await pdfDoc.getPage(page.sourcePageIndex + 1);
		const viewport = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
		const scale = thumbnailWidth / viewport.width;
		const scaledViewport = pdfPage.getViewport({ scale, rotation: page.rotation });

		const canvas = document.createElement('canvas');
		canvas.width = scaledViewport.width;
		canvas.height = scaledViewport.height;
		await pdfPage.render({ canvas, viewport: scaledViewport }).promise;
		const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

		pdfPage.cleanup();
		pdfDoc.destroy();
		return thumbnail;
	} else {
		const blob = new Blob([page.data.buffer as ArrayBuffer], { type: 'image/jpeg' });
		const url = URL.createObjectURL(blob);
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = reject;
			image.src = url;
		});
		URL.revokeObjectURL(url);

		const isRotated90 = page.rotation === 90 || page.rotation === 270;
		const srcW = img.width;
		const srcH = img.height;
		const dstW = isRotated90 ? srcH : srcW;
		const dstH = isRotated90 ? srcW : srcH;
		const scale = thumbnailWidth / dstW;

		const canvas = document.createElement('canvas');
		canvas.width = dstW * scale;
		canvas.height = dstH * scale;
		const ctx = canvas.getContext('2d')!;

		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate((page.rotation * Math.PI) / 180);
		ctx.drawImage(img, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);

		return canvas.toDataURL('image/jpeg', 0.7);
	}
}

/**
 * Export pages as a single PDF.
 * @param pages - Array of PageData to include
 * @returns PDF bytes as Uint8Array
 */
export async function exportAsPdf(pages: PageData[]): Promise<Uint8Array> {
	const outDoc = await PDFDocument.create();

	for (const page of pages) {
		if (page.sourceType === 'pdf') {
			const srcDoc = await PDFDocument.load(page.data);
			const [copiedPage] = await outDoc.copyPages(srcDoc, [page.sourcePageIndex]);
			copiedPage.setRotation(degrees(copiedPage.getRotation().angle + page.rotation));
			outDoc.addPage(copiedPage);
		} else {
			await addImagePageToPdf(outDoc, page);
		}
	}

	return outDoc.save();
}

/**
 * Export a single page as an image (JPEG or PNG).
 */
export async function exportPageAsImage(
	page: PageData,
	format: 'jpeg' | 'png' = 'jpeg',
	quality = 0.85,
	maxWidth = 2000
): Promise<Blob> {
	if (page.sourceType === 'pdf') {
		const pdfjs = await getPdfjs();
		const pdfDoc = await pdfjs.getDocument({ data: page.data.slice() }).promise;
		const pdfPage = await pdfDoc.getPage(page.sourcePageIndex + 1);
		const viewport = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
		const scale = Math.min(maxWidth / viewport.width, 2);
		const scaledViewport = pdfPage.getViewport({ scale, rotation: page.rotation });

		const canvas = document.createElement('canvas');
		canvas.width = scaledViewport.width;
		canvas.height = scaledViewport.height;
		await pdfPage.render({ canvas, viewport: scaledViewport }).promise;

		pdfPage.cleanup();
		pdfDoc.destroy();

		return new Promise((resolve) => {
			canvas.toBlob((blob) => resolve(blob!), `image/${format}`, quality);
		});
	} else {
		const blob = new Blob([page.data.buffer as ArrayBuffer]);
		const url = URL.createObjectURL(blob);
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = reject;
			image.src = url;
		});
		URL.revokeObjectURL(url);

		const isRotated90 = page.rotation === 90 || page.rotation === 270;
		const dstW = isRotated90 ? img.height : img.width;
		const dstH = isRotated90 ? img.width : img.height;

		const canvas = document.createElement('canvas');
		canvas.width = dstW;
		canvas.height = dstH;
		const ctx = canvas.getContext('2d')!;
		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate((page.rotation * Math.PI) / 180);
		ctx.drawImage(img, -img.width / 2, -img.height / 2);

		return new Promise((resolve) => {
			canvas.toBlob((blob) => resolve(blob!), `image/${format}`, quality);
		});
	}
}

/**
 * Create a blank white A4 page with thumbnail.
 * @returns PageData for a blank A4 page
 */
export async function createBlankPageData(): Promise<PageData> {
	const width = 595;
	const height = 842;
	const thumbnailWidth = 200;

	// Generate small white JPEG via canvas
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, height);

	const blob = await new Promise<Blob>((resolve) => {
		canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92);
	});
	const data = new Uint8Array(await blob.arrayBuffer());

	// Generate thumbnail
	const scale = thumbnailWidth / width;
	const thumbCanvas = document.createElement('canvas');
	thumbCanvas.width = thumbnailWidth;
	thumbCanvas.height = height * scale;
	const thumbCtx = thumbCanvas.getContext('2d')!;
	thumbCtx.fillStyle = '#ffffff';
	thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
	const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);

	return {
		id: crypto.randomUUID(),
		thumbnail,
		sourceType: 'image',
		sourceFile: 'blank',
		sourcePageIndex: -1,
		rotation: 0,
		data,
		width,
		height
	};
}

/**
 * Split pages into multiple PDFs by group.
 * @param pages - All workspace pages
 * @param groups - Named groups with 0-based page indices
 * @returns Array of { name, blob } pairs for each group
 */
export async function splitPdf(
	pages: PageData[],
	groups: { name: string; pageIndices: number[] }[]
): Promise<{ name: string; blob: Blob }[]> {
	const results: { name: string; blob: Blob }[] = [];
	for (const group of groups) {
		const groupPages = group.pageIndices.map(i => pages[i]).filter(Boolean);
		if (groupPages.length === 0) continue;
		const pdfBytes = await exportAsPdf(groupPages);
		const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
		results.push({ name: group.name, blob });
	}
	return results;
}

/**
 * Compress selected pages by re-rendering as JPEG at the given quality.
 * @param pages - All workspace pages
 * @param selectedIds - IDs of pages to compress
 * @param quality - JPEG quality (0.5–0.95)
 * @returns New pages array with compressed versions replacing originals
 */
export async function compressPages(
	pages: PageData[],
	selectedIds: Set<string>,
	quality: number
): Promise<PageData[]> {
	const result: PageData[] = [];

	for (const page of pages) {
		if (!selectedIds.has(page.id)) {
			result.push(page);
			continue;
		}

		let canvas: HTMLCanvasElement;

		if (page.sourceType === 'pdf') {
			const pdfjs = await getPdfjs();
			const pdfDoc = await pdfjs.getDocument({ data: page.data.slice() }).promise;
			const pdfPage = await pdfDoc.getPage(page.sourcePageIndex + 1);
			const viewport = pdfPage.getViewport({ scale: 1, rotation: page.rotation });

			canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			await pdfPage.render({ canvas, viewport }).promise;

			pdfPage.cleanup();
			pdfDoc.destroy();
		} else {
			const blob = new Blob([page.data.buffer as ArrayBuffer], { type: getMimeFromBytes(page.data) });
			const url = URL.createObjectURL(blob);
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = reject;
				image.src = url;
			});
			URL.revokeObjectURL(url);

			const isRotated90 = page.rotation === 90 || page.rotation === 270;
			const dstW = isRotated90 ? img.height : img.width;
			const dstH = isRotated90 ? img.width : img.height;

			canvas = document.createElement('canvas');
			canvas.width = dstW;
			canvas.height = dstH;
			const ctx = canvas.getContext('2d')!;
			ctx.translate(canvas.width / 2, canvas.height / 2);
			ctx.rotate((page.rotation * Math.PI) / 180);
			ctx.drawImage(img, -img.width / 2, -img.height / 2);
		}

		const jpegBlob = await new Promise<Blob>((resolve) => {
			canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality);
		});
		const data = new Uint8Array(await jpegBlob.arrayBuffer());

		// Regenerate thumbnail
		const thumbWidth = 200;
		const scale = thumbWidth / canvas.width;
		const thumbCanvas = document.createElement('canvas');
		thumbCanvas.width = thumbWidth;
		thumbCanvas.height = canvas.height * scale;
		const thumbCtx = thumbCanvas.getContext('2d')!;
		thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
		const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);

		result.push({
			id: page.id,
			thumbnail,
			sourceType: 'image',
			sourceFile: page.sourceFile,
			sourcePageIndex: -1,
			rotation: 0,
			data,
			width: canvas.width,
			height: canvas.height
		});
	}

	return result;
}

/** Detect image MIME type from byte header */
function getMimeFromBytes(bytes: Uint8Array): string {
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
	if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
	return 'image/jpeg';
}

/** Trigger a file download in the browser */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

// ─── Extract text ────────────────────────────────────────────────────

/**
 * Extract text content from all pages using pdfjs-dist.
 * @param pages - Array of PageData to extract text from
 * @returns Plain text content of all pages concatenated
 */
export async function extractText(pages: PageData[]): Promise<string> {
	const pdfjs = await getPdfjs();
	const textParts: string[] = [];

	// Group pages by source PDF to avoid opening the same PDF multiple times
	const bySource = new Map<string, PageData[]>();
	for (const page of pages) {
		const key = page.sourceType === 'pdf' ? `${page.sourceFile}:${page.data.byteLength}` : `img:${page.id}`;
		if (!bySource.has(key)) bySource.set(key, []);
		bySource.get(key)!.push(page);
	}

	for (const group of bySource.values()) {
		if (group[0].sourceType === 'pdf') {
			const pdfDoc = await pdfjs.getDocument({ data: group[0].data.slice() }).promise;
			for (const page of group) {
				const pdfPage = await pdfDoc.getPage(page.sourcePageIndex + 1);
				const content = await pdfPage.getTextContent();
				const pageText = content.items
					.map((item) => ('str' in item ? item.str : ''))
					.join(' ');
				if (pageText.trim()) {
					textParts.push(`--- Page ${pages.indexOf(page) + 1} ---\n${pageText.trim()}`);
				}
				pdfPage.cleanup();
			}
			pdfDoc.destroy();
		}
		// Images have no extractable text — skip silently
	}

	return textParts.join('\n\n');
}

// ─── Watermark ───────────────────────────────────────────────────────

export interface WatermarkOptions {
	text: string;
	fontSize: number;
	opacity: number;
	rotation: number;
	color: { r: number; g: number; b: number };
}

/**
 * Add a text watermark to each page of the PDF.
 * Returns new PDF bytes.
 */
export async function addWatermark(pages: PageData[], options: WatermarkOptions): Promise<Uint8Array> {
	const pdfBytes = await exportAsPdf(pages);
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const { text, fontSize, opacity, rotation, color } = options;

	const pdfPages = pdfDoc.getPages();
	for (const page of pdfPages) {
		const { width, height } = page.getSize();
		const textWidth = font.widthOfTextAtSize(text, fontSize);
		const textHeight = font.heightAtSize(fontSize);

		page.drawText(text, {
			x: (width - textWidth) / 2,
			y: (height - textHeight) / 2,
			size: fontSize,
			font,
			color: rgb(color.r, color.g, color.b),
			opacity,
			rotate: degrees(rotation),
		});
	}

	return pdfDoc.save();
}

// ─── Page numbers ────────────────────────────────────────────────────

export type PageNumberPosition = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';

export interface PageNumberOptions {
	position: PageNumberPosition;
	fontSize: number;
	startNumber: number;
	prefix: string;
}

/**
 * Add page numbers to each page of the PDF.
 * Returns new PDF bytes.
 */
export async function addPageNumbers(pages: PageData[], options: PageNumberOptions): Promise<Uint8Array> {
	const pdfBytes = await exportAsPdf(pages);
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const { position, fontSize, startNumber, prefix } = options;
	const margin = 30;

	const pdfPages = pdfDoc.getPages();
	for (let i = 0; i < pdfPages.length; i++) {
		const page = pdfPages[i];
		const { width, height } = page.getSize();
		const label = `${prefix}${startNumber + i}`;
		const textWidth = font.widthOfTextAtSize(label, fontSize);

		let x: number;
		let y: number;

		if (position.startsWith('bottom')) {
			y = margin;
		} else {
			y = height - margin - fontSize;
		}

		if (position.endsWith('center')) {
			x = (width - textWidth) / 2;
		} else if (position.endsWith('left')) {
			x = margin;
		} else {
			x = width - textWidth - margin;
		}

		page.drawText(label, {
			x, y,
			size: fontSize,
			font,
			color: rgb(0, 0, 0),
			opacity: 0.7,
		});
	}

	return pdfDoc.save();
}

// ─── Unlock PDF ──────────────────────────────────────────────────────

/**
 * Load a password-protected PDF file using pdfjs-dist.
 * @param file - The encrypted PDF file
 * @param password - The user/owner password
 * @param thumbnailWidth - Width of thumbnail in pixels
 * @returns Array of PageData objects
 */
export async function unlockPdf(file: File, password: string, thumbnailWidth = 200): Promise<PageData[]> {
	const arrayBuffer = await file.arrayBuffer();
	const uint8 = new Uint8Array(arrayBuffer);

	const pdfjs = await getPdfjs();
	const pdfDoc = await pdfjs.getDocument({ data: uint8.slice(), password }).promise;
	const pages: PageData[] = [];

	// Re-save without password via pdf-lib (load from rendered pages as images)
	for (let i = 0; i < pdfDoc.numPages; i++) {
		const page = await pdfDoc.getPage(i + 1);
		const viewport = page.getViewport({ scale: 1 });

		// Render full page to canvas
		const fullCanvas = document.createElement('canvas');
		fullCanvas.width = viewport.width;
		fullCanvas.height = viewport.height;
		await page.render({ canvas: fullCanvas, viewport }).promise;

		const jpegBlob = await new Promise<Blob>((resolve) => {
			fullCanvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92);
		});
		const data = new Uint8Array(await jpegBlob.arrayBuffer());

		// Thumbnail
		const scale = thumbnailWidth / viewport.width;
		const thumbCanvas = document.createElement('canvas');
		thumbCanvas.width = viewport.width * scale;
		thumbCanvas.height = viewport.height * scale;
		const thumbCtx = thumbCanvas.getContext('2d')!;
		thumbCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
		const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);

		pages.push({
			id: generatePageId(),
			thumbnail,
			sourceType: 'image',
			sourceFile: file.name,
			sourcePageIndex: -1,
			rotation: 0,
			data,
			width: viewport.width,
			height: viewport.height,
		});

		page.cleanup();
	}

	pdfDoc.destroy();
	return pages;
}

// ─── Protect PDF (password-protected ZIP wrapper) ────────────────────

/**
 * Check if a PDF file is password-protected.
 * Returns true if the PDF requires a password to open.
 */
export async function isPdfEncrypted(file: File): Promise<boolean> {
	const arrayBuffer = await file.arrayBuffer();
	const uint8 = new Uint8Array(arrayBuffer);
	const pdfjs = await getPdfjs();

	try {
		const doc = await pdfjs.getDocument({ data: uint8.slice() }).promise;
		doc.destroy();
		return false;
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'PasswordException') {
			return true;
		}
		return false;
	}
}

// ─── PDF to HTML ─────────────────────────────────────────────────────

/**
 * Export PDF pages as a styled HTML document with extracted text.
 * @param pages - Array of PageData to convert
 * @returns HTML string
 */
export async function exportAsHtml(pages: PageData[]): Promise<string> {
	const pdfjs = await getPdfjs();
	const htmlParts: string[] = [];

	htmlParts.push(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ScanFast PDF Export</title>
<style>
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 2rem auto; max-width: 800px; padding: 0 1rem; color: #333; line-height: 1.6; }
.page { border-bottom: 2px solid #e0e0e0; padding: 1.5rem 0; margin-bottom: 1.5rem; }
.page:last-child { border-bottom: none; }
.page-num { color: #0f62fe; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; }
.page-text { white-space: pre-wrap; }
h1 { font-size: 1.5rem; color: #161616; border-bottom: 3px solid #0f62fe; padding-bottom: 0.5rem; }
footer { margin-top: 2rem; color: #888; font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
<h1>Exported Document</h1>`);

	for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
		const page = pages[pageIdx];
		let pageText = '';

		if (page.sourceType === 'pdf') {
			const pdfDoc = await pdfjs.getDocument({ data: page.data.slice() }).promise;
			const pdfPage = await pdfDoc.getPage(page.sourcePageIndex + 1);
			const content = await pdfPage.getTextContent();
			pageText = content.items
				.map((item) => ('str' in item ? item.str : ''))
				.join(' ');
			pdfPage.cleanup();
			pdfDoc.destroy();
		}

		const escaped = pageText
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		htmlParts.push(`<div class="page">
<div class="page-num">Page ${pageIdx + 1}</div>
<div class="page-text">${escaped || '<em>(Image page — no text content)</em>'}</div>
</div>`);
	}

	htmlParts.push(`<footer>Generated by ScanFast.online</footer>
</body>
</html>`);

	return htmlParts.join('\n');
}

// ─── PDF/A ───────────────────────────────────────────────────────────

/**
 * Export pages as a PDF with archival metadata (best-effort PDF/A-1b).
 * Adds required metadata fields. Full strict compliance requires ICC profiles
 * and font embedding verification which is beyond client-side scope.
 */
export async function exportAsPdfA(pages: PageData[]): Promise<Uint8Array> {
	const pdfBytes = await exportAsPdf(pages);
	const pdfDoc = await PDFDocument.load(pdfBytes);

	pdfDoc.setTitle('ScanFast Export');
	pdfDoc.setAuthor('ScanFast.online');
	pdfDoc.setCreator('ScanFast.online');
	pdfDoc.setProducer('ScanFast.online (pdf-lib)');
	pdfDoc.setCreationDate(new Date());
	pdfDoc.setModificationDate(new Date());

	return pdfDoc.save();
}
