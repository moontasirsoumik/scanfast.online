/** @module Image filters — canvas-based filter pipeline for scanned documents. */

import type { QuadCrop, Point } from '@/stores/scanner';

/** Available image filter types */
export type FilterType = 'original' | 'enhance' | 'document' | 'bw' | 'grayscale' | 'sharpen' | 'color';

/** Maximum pixel dimension for stored images (preserves small text at ~257 DPI on A4) */
const MAX_IMAGE_DIMENSION = 3000;

/** Load a Blob into an HTMLImageElement, ignoring EXIF orientation so manual rotation is correct */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
	// Use createImageBitmap with imageOrientation 'none' to get raw pixels
	// (browsers auto-apply EXIF to <img>, which would cause double-rotation)
	return createImageBitmap(blob, { imageOrientation: 'none' }).then((bitmap) => {
		// Downscale if larger than MAX_IMAGE_DIMENSION
		let w = bitmap.width;
		let h = bitmap.height;
		const maxDim = Math.max(w, h);
		if (maxDim > MAX_IMAGE_DIMENSION) {
			const scale = MAX_IMAGE_DIMENSION / maxDim;
			w = Math.round(w * scale);
			h = Math.round(h * scale);
		}

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to get canvas 2d context');
		ctx.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();

		return new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = canvas.toDataURL('image/jpeg', 0.95);
		});
	});
}

/** Downscale a Blob if it exceeds MAX_IMAGE_DIMENSION, returning a smaller JPEG Blob */
export async function downscaleBlob(blob: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
	const maxDim = Math.max(bitmap.width, bitmap.height);
	if (maxDim <= MAX_IMAGE_DIMENSION) {
		bitmap.close();
		return blob;
	}
	const scale = MAX_IMAGE_DIMENSION / maxDim;
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) { bitmap.close(); return blob; }
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();
	return new Promise<Blob>((resolve) => {
		canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.92);
	});
}

/** Get a 2D context from a canvas, throwing on failure */
function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to get canvas 2d context');
	return ctx;
}

// --- Internal filter implementations ---

function applyGrayscale(data: Uint8ClampedArray): void {
	for (let i = 0; i < data.length; i += 4) {
		const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
		data[i] = data[i + 1] = data[i + 2] = lum;
	}
}

function applyBW(data: Uint8ClampedArray): void {
	// Convert to grayscale first
	const gray = new Uint8Array(data.length / 4);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
	}

	// Otsu's threshold
	const histogram = new Uint32Array(256);
	for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

	const total = gray.length;
	let sumTotal = 0;
	for (let i = 0; i < 256; i++) sumTotal += i * histogram[i];

	let sumBg = 0;
	let weightBg = 0;
	let maxVariance = 0;
	let threshold = 128;

	for (let t = 0; t < 256; t++) {
		weightBg += histogram[t];
		if (weightBg === 0) continue;
		const weightFg = total - weightBg;
		if (weightFg === 0) break;

		sumBg += t * histogram[t];
		const meanBg = sumBg / weightBg;
		const meanFg = (sumTotal - sumBg) / weightFg;
		const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);

		if (variance > maxVariance) {
			maxVariance = variance;
			threshold = t;
		}
	}

	// Binarize
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		const val = gray[j] > threshold ? 255 : 0;
		data[i] = data[i + 1] = data[i + 2] = val;
	}
}

function applyDocument(data: Uint8ClampedArray): void {
	// Like B&W (Otsu) but keeps original color for dark pixels
	const gray = new Uint8Array(data.length / 4);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
	}

	// Otsu's threshold
	const histogram = new Uint32Array(256);
	for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

	const total = gray.length;
	let sumTotal = 0;
	for (let i = 0; i < 256; i++) sumTotal += i * histogram[i];

	let sumBg = 0;
	let weightBg = 0;
	let maxVariance = 0;
	let threshold = 128;

	for (let t = 0; t < 256; t++) {
		weightBg += histogram[t];
		if (weightBg === 0) continue;
		const weightFg = total - weightBg;
		if (weightFg === 0) break;

		sumBg += t * histogram[t];
		const meanBg = sumBg / weightBg;
		const meanFg = (sumTotal - sumBg) / weightFg;
		const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);

		if (variance > maxVariance) {
			maxVariance = variance;
			threshold = t;
		}
	}

	// Background → white, foreground → keep color (boosted)
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		if (gray[j] > threshold) {
			data[i] = data[i + 1] = data[i + 2] = 255;
		}
		// else keep original color
	}
}

function applyEnhance(data: Uint8ClampedArray): void {
	// Adaptive contrast: brighten darks, darken lights, slight contrast boost
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			const val = data[i + c] / 255;
			// S-curve for contrast enhancement
			const enhanced = val < 0.5
				? 2 * val * val
				: 1 - 2 * (1 - val) * (1 - val);
			// Blend 60% enhanced + 40% original for subtlety
			data[i + c] = Math.min(255, Math.max(0, (0.6 * enhanced + 0.4 * val) * 255));
		}
	}
}

function applyPhotoColor(data: Uint8ClampedArray): void {
	// --- Pass 1: Saturation boost (RGB → HSL → boost S by 20% → RGB) ---
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i] / 255;
		const g = data[i + 1] / 255;
		const b = data[i + 2] / 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const delta = max - min;
		const l = (max + min) / 2;

		let h = 0;
		let s = 0;

		if (delta !== 0) {
			s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
			if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
			else if (max === g) h = ((b - r) / delta + 2) / 6;
			else h = ((r - g) / delta + 4) / 6;
		}

		// Boost saturation by 20%
		s = Math.min(1, s * 1.2);

		// HSL → RGB
		let rr: number, gg: number, bb: number;
		if (s === 0) {
			rr = gg = bb = l;
		} else {
			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			const hue2rgb = (pp: number, qq: number, t: number): number => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
				if (t < 1 / 2) return qq;
				if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
				return pp;
			};
			rr = hue2rgb(p, q, h + 1 / 3);
			gg = hue2rgb(p, q, h);
			bb = hue2rgb(p, q, h - 1 / 3);
		}

		data[i] = Math.round(rr * 255);
		data[i + 1] = Math.round(gg * 255);
		data[i + 2] = Math.round(bb * 255);
	}

	// --- Pass 2: Auto-levels (1st/99th percentile stretch per channel) ---
	const histR = new Uint32Array(256);
	const histG = new Uint32Array(256);
	const histB = new Uint32Array(256);
	const pixelCount = data.length / 4;

	for (let i = 0; i < data.length; i += 4) {
		histR[data[i]]++;
		histG[data[i + 1]]++;
		histB[data[i + 2]]++;
	}

	const findPercentile = (hist: Uint32Array, total: number, pct: number): number => {
		const target = Math.floor(total * pct);
		let sum = 0;
		for (let i = 0; i < 256; i++) {
			sum += hist[i];
			if (sum >= target) return i;
		}
		return 255;
	};

	const loR = findPercentile(histR, pixelCount, 0.01);
	const hiR = findPercentile(histR, pixelCount, 0.99);
	const loG = findPercentile(histG, pixelCount, 0.01);
	const hiG = findPercentile(histG, pixelCount, 0.99);
	const loB = findPercentile(histB, pixelCount, 0.01);
	const hiB = findPercentile(histB, pixelCount, 0.99);

	const stretch = (val: number, lo: number, hi: number): number => {
		if (hi <= lo) return val;
		return Math.min(255, Math.max(0, ((val - lo) / (hi - lo)) * 255));
	};

	for (let i = 0; i < data.length; i += 4) {
		data[i] = stretch(data[i], loR, hiR);
		data[i + 1] = stretch(data[i + 1], loG, hiG);
		data[i + 2] = stretch(data[i + 2], loB, hiB);
	}

	// --- Pass 3: Slight warmth (+3 R, -3 B) ---
	for (let i = 0; i < data.length; i += 4) {
		data[i] = Math.min(255, data[i] + 3);
		data[i + 2] = Math.max(0, data[i + 2] - 3);
	}
}

function applySharpen(
	source: ImageData,
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D
): void {
	const { width, height, data: srcData } = source;

	// Box blur the source (3x3 kernel)
	const blurred = new Float32Array(srcData.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4;
			for (let c = 0; c < 3; c++) {
				let sum = 0;
				let count = 0;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const ny = y + dy;
						const nx = x + dx;
						if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
							sum += srcData[(ny * width + nx) * 4 + c];
							count++;
						}
					}
				}
				blurred[idx + c] = sum / count;
			}
			blurred[idx + 3] = srcData[idx + 3];
		}
	}

	// Unsharp mask: original + strength * (original - blurred)
	const strength = 0.8;
	const output = ctx.createImageData(width, height);
	const outData = output.data;
	for (let i = 0; i < srcData.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			const diff = srcData[i + c] - blurred[i + c];
			outData[i + c] = Math.min(255, Math.max(0, srcData[i + c] + strength * diff));
		}
		outData[i + 3] = srcData[i + 3];
	}

	ctx.putImageData(output, 0, 0);
}

// --- Perspective correction ---

/**
 * Solve the 8-parameter projective transform mapping src points to dst points.
 * Returns [a,b,c,d,e,f,g,h] such that for each correspondence:
 *   xd = (a*xs + b*ys + c) / (g*xs + h*ys + 1)
 *   yd = (d*xs + e*ys + f) / (g*xs + h*ys + 1)
 * Uses Gaussian elimination on the 8x9 augmented matrix.
 * Returns identity-like coefficients if the system is singular.
 */
function solveProjectiveTransform(
	src: [Point, Point, Point, Point],
	dst: [Point, Point, Point, Point]
): Float64Array {
	// Build 8x9 augmented matrix
	const A: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const xs = src[i].x, ys = src[i].y;
		const xd = dst[i].x, yd = dst[i].y;
		A.push([xs, ys, 1, 0, 0, 0, -xs * xd, -ys * xd, xd]);
		A.push([0, 0, 0, xs, ys, 1, -xs * yd, -ys * yd, yd]);
	}

	const n = 8;
	// Gaussian elimination with partial pivoting
	for (let col = 0; col < n; col++) {
		let maxRow = col;
		let maxVal = Math.abs(A[col][col]);
		for (let row = col + 1; row < n; row++) {
			const val = Math.abs(A[row][col]);
			if (val > maxVal) { maxVal = val; maxRow = row; }
		}

		if (maxVal < 1e-12) {
			// Singular — return identity-like transform
			return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0]);
		}

		if (maxRow !== col) {
			const tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
		}

		const pivot = A[col][col];
		for (let j = col; j <= n; j++) A[col][j] /= pivot;

		for (let row = 0; row < n; row++) {
			if (row === col) continue;
			const factor = A[row][col];
			for (let j = col; j <= n; j++) {
				A[row][j] -= factor * A[col][j];
			}
		}
	}

	const result = new Float64Array(8);
	for (let i = 0; i < 8; i++) result[i] = A[i][n];
	return result;
}

/**
 * Apply perspective correction: map a quadrilateral region to a rectangle.
 * Uses inverse mapping with nearest-neighbor sampling.
 */
function perspectiveCorrect(
	sourceCanvas: HTMLCanvasElement,
	quad: QuadCrop,
	imgWidth: number,
	imgHeight: number
): HTMLCanvasElement {
	// Convert normalized quad to pixel coords
	const srcPts: [Point, Point, Point, Point] = [
		{ x: quad.tl.x * imgWidth, y: quad.tl.y * imgHeight },
		{ x: quad.tr.x * imgWidth, y: quad.tr.y * imgHeight },
		{ x: quad.br.x * imgWidth, y: quad.br.y * imgHeight },
		{ x: quad.bl.x * imgWidth, y: quad.bl.y * imgHeight }
	];

	// Output size: max of opposite edges
	const topEdge = Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y);
	const bottomEdge = Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y);
	const leftEdge = Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y);
	const rightEdge = Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y);

	const outW = Math.round(Math.max(topEdge, bottomEdge));
	const outH = Math.round(Math.max(leftEdge, rightEdge));

	if (outW <= 0 || outH <= 0) {
		// Degenerate quad — return 1x1 canvas
		const c = document.createElement('canvas');
		c.width = 1;
		c.height = 1;
		return c;
	}

	const dstPts: [Point, Point, Point, Point] = [
		{ x: 0, y: 0 },
		{ x: outW, y: 0 },
		{ x: outW, y: outH },
		{ x: 0, y: outH }
	];

	// Solve for inverse mapping: dst → src
	const coeffs = solveProjectiveTransform(dstPts, srcPts);

	// Read source pixels
	const srcCtx = sourceCanvas.getContext('2d');
	if (!srcCtx) throw new Error('Failed to get canvas 2d context');
	const srcData = srcCtx.getImageData(0, 0, imgWidth, imgHeight);

	// Create output
	const outCanvas = document.createElement('canvas');
	outCanvas.width = outW;
	outCanvas.height = outH;
	const outCtx = outCanvas.getContext('2d');
	if (!outCtx) throw new Error('Failed to get canvas 2d context');
	const outData = outCtx.createImageData(outW, outH);

	// For each output pixel, find source pixel via inverse transform
	const [a, b, c, d, e, f, g, h] = coeffs;
	for (let dy = 0; dy < outH; dy++) {
		for (let dx = 0; dx < outW; dx++) {
			const denom = g * dx + h * dy + 1;
			const sx = (a * dx + b * dy + c) / denom;
			const sy = (d * dx + e * dy + f) / denom;

			// Nearest neighbor sampling
			const ix = Math.round(sx);
			const iy = Math.round(sy);

			if (ix >= 0 && ix < imgWidth && iy >= 0 && iy < imgHeight) {
				const srcIdx = (iy * imgWidth + ix) * 4;
				const dstIdx = (dy * outW + dx) * 4;
				outData.data[dstIdx] = srcData.data[srcIdx];
				outData.data[dstIdx + 1] = srcData.data[srcIdx + 1];
				outData.data[dstIdx + 2] = srcData.data[srcIdx + 2];
				outData.data[dstIdx + 3] = srcData.data[srcIdx + 3];
			}
		}
	}

	outCtx.putImageData(outData, 0, 0);
	return outCanvas;
}

// --- Public API ---

/** Apply a filter to an image blob, returning a data URL */
export async function applyFilter(sourceBlob: Blob, filter: FilterType): Promise<string> {
	const img = await loadImage(sourceBlob);
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = getContext(canvas);

	ctx.drawImage(img, 0, 0);

	if (filter === 'original') {
		return canvas.toDataURL('image/jpeg', 0.92);
	}

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	if (filter === 'sharpen') {
		applySharpen(imageData, canvas, ctx);
	} else {
		if (filter === 'grayscale') applyGrayscale(imageData.data);
		else if (filter === 'bw') applyBW(imageData.data);
		else if (filter === 'document') applyDocument(imageData.data);
		else if (filter === 'enhance') applyEnhance(imageData.data);
		else if (filter === 'color') applyPhotoColor(imageData.data);
		ctx.putImageData(imageData, 0, 0);
	}

	return canvas.toDataURL('image/jpeg', 0.92);
}

/** Generate a thumbnail data URL from a blob */
export async function generateThumbnail(sourceBlob: Blob, maxWidth = 120): Promise<string> {
	const img = await loadImage(sourceBlob);
	const scale = maxWidth / img.width;
	const canvas = document.createElement('canvas');
	canvas.width = maxWidth;
	canvas.height = Math.round(img.height * scale);
	const ctx = getContext(canvas);

	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Full processing pipeline: crop → rotate → straighten → filter → generate display and thumbnail data URLs.
 */
export async function processPage(
	blob: Blob,
	filter: FilterType,
	rotation: number,
	crop: QuadCrop | null,
	straighten = 0
): Promise<{ dataUrl: string; thumbnail: string }> {
	const img = await loadImage(blob);

	// --- Step 1: Perspective crop ---
	let croppedCanvas: HTMLCanvasElement;
	if (crop) {
		const tmpCanvas = document.createElement('canvas');
		tmpCanvas.width = img.width;
		tmpCanvas.height = img.height;
		const tmpCtx = getContext(tmpCanvas);
		tmpCtx.drawImage(img, 0, 0);
		croppedCanvas = perspectiveCorrect(tmpCanvas, crop, img.width, img.height);
	} else {
		croppedCanvas = document.createElement('canvas');
		croppedCanvas.width = img.width;
		croppedCanvas.height = img.height;
		const tmpCtx = getContext(croppedCanvas);
		tmpCtx.drawImage(img, 0, 0);
	}

	const cW = croppedCanvas.width;
	const cH = croppedCanvas.height;

	// --- Step 2: Rotate ---
	const normalizedRotation = ((rotation % 360) + 360) % 360;
	const swapDimensions = normalizedRotation === 90 || normalizedRotation === 270;
	const outW = swapDimensions ? cH : cW;
	const outH = swapDimensions ? cW : cH;

	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = getContext(canvas);

	ctx.save();
	ctx.translate(outW / 2, outH / 2);
	ctx.rotate((normalizedRotation * Math.PI) / 180);
	ctx.drawImage(croppedCanvas, -cW / 2, -cH / 2);
	ctx.restore();

	// --- Step 2b: Fine straighten ---
	if (straighten !== 0) {
		const radians = (straighten * Math.PI) / 180;
		const cos = Math.abs(Math.cos(radians));
		const sin = Math.abs(Math.sin(radians));
		const newW = Math.ceil(outW * cos + outH * sin);
		const newH = Math.ceil(outW * sin + outH * cos);

		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = newW;
		tempCanvas.height = newH;
		const tempCtx = getContext(tempCanvas);

		tempCtx.save();
		tempCtx.translate(newW / 2, newH / 2);
		tempCtx.rotate(radians);
		tempCtx.drawImage(canvas, -outW / 2, -outH / 2);
		tempCtx.restore();

		// Crop back to original dimensions from center
		canvas.width = outW;
		canvas.height = outH;
		const cropX = (newW - outW) / 2;
		const cropY = (newH - outH) / 2;
		ctx.drawImage(tempCanvas, cropX, cropY, outW, outH, 0, 0, outW, outH);
	}

	// --- Step 3: Filter ---
	if (filter !== 'original') {
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

		if (filter === 'sharpen') {
			applySharpen(imageData, canvas, ctx);
		} else {
			if (filter === 'grayscale') applyGrayscale(imageData.data);
			else if (filter === 'bw') applyBW(imageData.data);
			else if (filter === 'document') applyDocument(imageData.data);
			else if (filter === 'enhance') applyEnhance(imageData.data);
			else if (filter === 'color') applyPhotoColor(imageData.data);
			ctx.putImageData(imageData, 0, 0);
		}
	}

	const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

	// --- Step 4: Thumbnail ---
	const thumbMaxWidth = 120;
	const thumbScale = thumbMaxWidth / canvas.width;
	const thumbCanvas = document.createElement('canvas');
	thumbCanvas.width = thumbMaxWidth;
	thumbCanvas.height = Math.round(canvas.height * thumbScale);
	const thumbCtx = getContext(thumbCanvas);
	thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
	const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);

	return { dataUrl, thumbnail };
}

/** Read EXIF orientation tag from a JPEG blob (returns 1–8, or 1 if not found) */
export async function readExifOrientation(blob: Blob): Promise<number> {
	const HEADER_SIZE = 65536;
	const slice = blob.slice(0, Math.min(blob.size, HEADER_SIZE));
	const buf = await slice.arrayBuffer();
	const view = new DataView(buf);

	// Check JPEG SOI marker
	if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return 1;

	let offset = 2;
	while (offset < view.byteLength - 4) {
		const marker = view.getUint16(offset);
		offset += 2;

		// APP1 marker (EXIF)
		if (marker === 0xFFE1) {
			const segLen = view.getUint16(offset);
			// Check "Exif\0\0"
			if (
				offset + 8 < view.byteLength &&
				view.getUint32(offset + 2) === 0x45786966 &&
				view.getUint16(offset + 6) === 0x0000
			) {
				const tiffStart = offset + 8;
				if (tiffStart + 8 > view.byteLength) return 1;

				const littleEndian = view.getUint16(tiffStart) === 0x4949;
				const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
				const ifdStart = tiffStart + ifdOffset;

				if (ifdStart + 2 > view.byteLength) return 1;
				const entryCount = view.getUint16(ifdStart, littleEndian);

				for (let i = 0; i < entryCount; i++) {
					const entryOffset = ifdStart + 2 + i * 12;
					if (entryOffset + 12 > view.byteLength) break;
					const tag = view.getUint16(entryOffset, littleEndian);
					if (tag === 0x0112) {
						return view.getUint16(entryOffset + 8, littleEndian);
					}
				}
			}
			return 1;
		}

		// Skip non-APP1 segments
		if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD9) {
			const len = view.getUint16(offset);
			offset += len;
		} else {
			break;
		}
	}

	return 1;
}

/** Map EXIF orientation to rotation degrees (handles rotation only, not mirroring) */
export function exifOrientationToDegrees(orientation: number): number {
	switch (orientation) {
		case 3: return 180;
		case 6: return 90;
		case 8: return 270;
		default: return 0;
	}
}
