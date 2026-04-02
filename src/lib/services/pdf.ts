import { PDFDocument, degrees } from 'pdf-lib';

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
			// For images, pre-render with rotation to canvas, then embed as JPEG
			const imgBlob = new Blob([page.data.buffer as ArrayBuffer]);
			const url = URL.createObjectURL(imgBlob);
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

			const jpegBlob = await new Promise<Blob>((resolve) => {
				canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92);
			});
			const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
			const embedded = await outDoc.embedJpg(jpegBytes);
			const pdfPage = outDoc.addPage([dstW, dstH]);
			pdfPage.drawImage(embedded, { x: 0, y: 0, width: dstW, height: dstH });
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
