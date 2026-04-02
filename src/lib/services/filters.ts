/** @module Image filters — canvas-based filter pipeline for scanned documents. */

import type { CropRect } from '$lib/stores/scanner.svelte';

/** Available image filter types */
export type FilterType = 'original' | 'enhance' | 'bw' | 'grayscale' | 'sharpen';

/** Load a Blob into an HTMLImageElement */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(blob);
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
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
		else if (filter === 'enhance') applyEnhance(imageData.data);
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
 * Full processing pipeline: crop → rotate → filter → generate display and thumbnail data URLs.
 */
export async function processPage(
	blob: Blob,
	filter: FilterType,
	rotation: number,
	crop: CropRect | null
): Promise<{ dataUrl: string; thumbnail: string }> {
	const img = await loadImage(blob);

	// --- Step 1: Crop ---
	let srcX = 0;
	let srcY = 0;
	let srcW = img.width;
	let srcH = img.height;

	if (crop) {
		srcX = Math.round(crop.x * img.width);
		srcY = Math.round(crop.y * img.height);
		srcW = Math.round(crop.width * img.width);
		srcH = Math.round(crop.height * img.height);
	}

	// --- Step 2: Rotate ---
	const normalizedRotation = ((rotation % 360) + 360) % 360;
	const swapDimensions = normalizedRotation === 90 || normalizedRotation === 270;
	const outW = swapDimensions ? srcH : srcW;
	const outH = swapDimensions ? srcW : srcH;

	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = getContext(canvas);

	ctx.save();
	ctx.translate(outW / 2, outH / 2);
	ctx.rotate((normalizedRotation * Math.PI) / 180);
	ctx.drawImage(img, srcX, srcY, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH);
	ctx.restore();

	// --- Step 3: Filter ---
	if (filter !== 'original') {
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

		if (filter === 'sharpen') {
			applySharpen(imageData, canvas, ctx);
		} else {
			if (filter === 'grayscale') applyGrayscale(imageData.data);
			else if (filter === 'bw') applyBW(imageData.data);
			else if (filter === 'enhance') applyEnhance(imageData.data);
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
