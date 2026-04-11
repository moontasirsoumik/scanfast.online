/**
 * @module Document detection — real-time rectangular document detection
 * using pure Canvas API. No OpenCV dependency.
 *
 * Strategy: grayscale → blur → edge detection → dilate (to close gaps) →
 * flood fill from image border → largest enclosed interior region →
 * convex hull → polygon approximation → quadrilateral scoring →
 * temporal stabilization.
 *
 * This avoids fragile contour tracing. Instead, edges form a barrier and
 * flood fill from the border identifies what's "outside". Everything NOT
 * reached is the document interior.
 */

import type { QuadCrop } from '@/stores/scanner';

// ─── Configuration ────────────────────────────────────────────────────

/** Processing resolution (longest edge) for real-time detection */
const DETECT_SIZE = 640;
/** Higher resolution for static image (capture-time) detection */
const HQ_DETECT_SIZE = 1200;
/** Minimum quad area as fraction of frame */
const MIN_AREA_RATIO = 0.04;
/** Maximum quad area as fraction of frame */
const MAX_AREA_RATIO = 0.998;
/** Minimum interior blob size as fraction of frame pixels */
const MIN_BLOB_RATIO = 0.03;
/** Minimum corner angle (degrees) */
const MIN_CORNER_ANGLE = 45;
/** Maximum corner angle (degrees) */
const MAX_CORNER_ANGLE = 145;
/** Number of frames to average for stabilization */
const STABILIZE_FRAMES = 6;
/** Minimum score to accept a quad */
const MIN_SCORE = 0.2;
/** No border clearing — edges at the frame border are valid barriers for close-up detection */
const BORDER_CLEAR_PX = 0;

// ─── Types ────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

interface DetectionResult {
	quad: QuadCrop | null;
	confidence: number;
}

interface ScoredQuad {
	corners: [Pt, Pt, Pt, Pt];
	score: number;
}

/** A line in the form ax + by + c = 0 */
interface Line { a: number; b: number; c: number }

interface GradientField {
	gx: Float32Array;
	gy: Float32Array;
	mag: Float32Array;
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
	const gray = new Uint8Array(w * h);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
	}
	return gray;
}

/**
 * Extract individual R, G, B channels from RGBA data.
 */
function extractChannels(data: Uint8ClampedArray, w: number, h: number): [Uint8Array, Uint8Array, Uint8Array] {
	const r = new Uint8Array(w * h);
	const g = new Uint8Array(w * h);
	const b = new Uint8Array(w * h);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		r[j] = data[i]; g[j] = data[i + 1]; b[j] = data[i + 2];
	}
	return [r, g, b];
}

/**
 * CLAHE — Contrast Limited Adaptive Histogram Equalization.
 * Dramatically boosts local contrast for low-contrast document edges.
 */
function clahe(
	src: Uint8Array, w: number, h: number,
	tilesX = 8, tilesY = 8, clipLimit = 3.0
): Uint8Array {
	const dst = new Uint8Array(w * h);
	const tileW = Math.ceil(w / tilesX);
	const tileH = Math.ceil(h / tilesY);
	const BINS = 256;
	const totalTiles = tilesX * tilesY;

	// Build LUT for each tile
	const luts = new Uint8Array(totalTiles * BINS);

	for (let ty = 0; ty < tilesY; ty++) {
		for (let tx = 0; tx < tilesX; tx++) {
			const x0 = tx * tileW;
			const y0 = ty * tileH;
			const x1 = Math.min(x0 + tileW, w);
			const y1 = Math.min(y0 + tileH, h);
			const tilePixels = (x1 - x0) * (y1 - y0);

			// Histogram
			const hist = new Int32Array(BINS);
			for (let yy = y0; yy < y1; yy++)
				for (let xx = x0; xx < x1; xx++)
					hist[src[yy * w + xx]]++;

			// Clip
			const limit = Math.max(1, (clipLimit * tilePixels / BINS) | 0);
			let excess = 0;
			for (let i = 0; i < BINS; i++) {
				if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
			}
			const increment = (excess / BINS) | 0;
			for (let i = 0; i < BINS; i++) hist[i] += increment;

			// CDF → LUT
			const lutOff = (ty * tilesX + tx) * BINS;
			let cdf = 0;
			for (let i = 0; i < BINS; i++) {
				cdf += hist[i];
				luts[lutOff + i] = Math.min(255, ((cdf * 255 / tilePixels) + 0.5) | 0);
			}
		}
	}

	// Bilinear interpolation between tile LUTs
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const val = src[y * w + x];
			// Which tile center is this pixel near?
			const fx = (x + 0.5) / tileW - 0.5;
			const fy = (y + 0.5) / tileH - 0.5;
			const tx0 = Math.max(0, Math.floor(fx));
			const ty0 = Math.max(0, Math.floor(fy));
			const tx1 = Math.min(tilesX - 1, tx0 + 1);
			const ty1 = Math.min(tilesY - 1, ty0 + 1);
			const ax = fx - tx0;
			const ay = fy - ty0;

			const v00 = luts[(ty0 * tilesX + tx0) * BINS + val];
			const v10 = luts[(ty0 * tilesX + tx1) * BINS + val];
			const v01 = luts[(ty1 * tilesX + tx0) * BINS + val];
			const v11 = luts[(ty1 * tilesX + tx1) * BINS + val];

			dst[y * w + x] = (
				v00 * (1 - ax) * (1 - ay) +
				v10 * ax * (1 - ay) +
				v01 * (1 - ax) * ay +
				v11 * ax * ay + 0.5
			) | 0;
		}
	}

	return dst;
}

/**
 * Multi-channel color edge detection.
 * Computes max gradient magnitude across R, G, B channels independently.
 * Catches edges invisible in grayscale (e.g., white paper on beige desk).
 */
function colorEdgeMagnitude(
	channels: [Uint8Array, Uint8Array, Uint8Array],
	w: number, h: number
): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			let maxMag = 0;
			for (const ch of channels) {
				const gx =
					-ch[(y - 1) * w + x - 1] + ch[(y - 1) * w + x + 1]
					- 2 * ch[y * w + x - 1] + 2 * ch[y * w + x + 1]
					- ch[(y + 1) * w + x - 1] + ch[(y + 1) * w + x + 1];
				const gy =
					-ch[(y - 1) * w + x - 1] - 2 * ch[(y - 1) * w + x] - ch[(y - 1) * w + x + 1]
					+ ch[(y + 1) * w + x - 1] + 2 * ch[(y + 1) * w + x] + ch[(y + 1) * w + x + 1];
				const mag = Math.sqrt(gx * gx + gy * gy);
				if (mag > maxMag) maxMag = mag;
			}
			out[i] = Math.min(255, maxMag) | 0;
		}
	}
	return out;
}

/**
 * Threshold a gradient magnitude image into binary edges.
 */
function thresholdMagnitude(mag: Uint8Array, w: number, h: number, threshold: number): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let i = 0; i < mag.length; i++) {
		out[i] = mag[i] >= threshold ? 255 : 0;
	}
	return out;
}

function percentile(values: Uint8Array, q: number): number {
	if (values.length === 0) return 0;
	const hist = new Uint32Array(256);
	for (let i = 0; i < values.length; i++) hist[values[i]]++;
	const target = Math.max(0, Math.min(values.length - 1, Math.floor(q * (values.length - 1))));
	let seen = 0;
	for (let i = 0; i < hist.length; i++) {
		seen += hist[i];
		if (seen > target) return i;
	}
	return 255;
}

function computePaperScore(
	data: Uint8ClampedArray,
	w: number,
	h: number
): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const maxC = Math.max(r, g, b);
		const minC = Math.min(r, g, b);
		const brightness = (r + g + b) / 3;
		const saturation = maxC - minC;
		const neutrality = 255 - saturation;
		const score = brightness * 0.55 + minC * 0.35 + neutrality * 0.22;
		out[j] = Math.max(0, Math.min(255, Math.round(score)));
	}
	return out;
}

function thresholdPaperMask(score: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(w * h);
	const p50 = percentile(score, 0.50);
	const p70 = percentile(score, 0.70);
	const p82 = percentile(score, 0.82);

	// When paper fills most of the frame, p70 and p82 are both high (all paper),
	// making the threshold too high and splitting the paper. Detect this case
	// and use a lower, absolute-biased threshold.
	const spread = p82 - p50;
	let threshold: number;
	if (spread < 25) {
		// Low spread = paper dominates the frame. Use absolute floor based on
		// the bimodal valley between dark background and bright paper.
		threshold = Math.max(110, Math.round(p50 * 0.55 + 60));
	} else {
		threshold = Math.max(120, Math.min(210, Math.round(p70 * 0.40 + p82 * 0.45 + 15)));
	}

	for (let i = 0; i < score.length; i++) {
		out[i] = score[i] >= threshold ? 255 : 0;
	}
	return out;
}

/** Separable 5×5 Gaussian blur (σ ≈ 1.4) */
function gaussianBlur(src: Uint8Array, w: number, h: number): Uint8Array {
	const K = [1, 4, 6, 4, 1];
	const tmp = new Uint8Array(w * h);
	const dst = new Uint8Array(w * h);

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let s = 0;
			for (let k = -2; k <= 2; k++)
				s += src[y * w + Math.min(w - 1, Math.max(0, x + k))] * K[k + 2];
			tmp[y * w + x] = (s >> 4);
		}
	}
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let s = 0;
			for (let k = -2; k <= 2; k++)
				s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x] * K[k + 2];
			dst[y * w + x] = (s >> 4);
		}
	}
	return dst;
}

// ═══════════════════════════════════════════════════════════════════════
// CANNY EDGE DETECTION (with queue-based hysteresis)
// ═══════════════════════════════════════════════════════════════════════

function cannyEdges(
	gray: Uint8Array, w: number, h: number,
	lo: number, hi: number
): Uint8Array {
	const mag = new Float32Array(w * h);
	const dir = new Uint8Array(w * h);

	// Sobel gradients
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			const gx =
				-gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x + 1]
				- 2 * gray[y * w + x - 1] + 2 * gray[y * w + x + 1]
				- gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x + 1];
			const gy =
				-gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1]
				+ gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
			mag[i] = Math.sqrt(gx * gx + gy * gy);

			let angle = Math.atan2(gy, gx) * 57.29578;
			if (angle < 0) angle += 180;
			dir[i] = angle < 22.5 || angle >= 157.5 ? 0
				: angle < 67.5 ? 1
					: angle < 112.5 ? 2 : 3;
		}
	}

	// Non-maximum suppression
	const nms = new Uint8Array(w * h);
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			const m = mag[i];
			let n1: number, n2: number;
			switch (dir[i]) {
				case 0: n1 = mag[i - w]; n2 = mag[i + w]; break;
				case 1: n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; break;
				case 2: n1 = mag[i - 1]; n2 = mag[i + 1]; break;
				default: n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; break;
			}
			if (m > n1 && m > n2) nms[i] = Math.min(255, m) | 0;
		}
	}

	// Queue-based hysteresis (O(n) instead of iterative O(n²))
	const edges = new Uint8Array(w * h);
	const queue: number[] = [];

	for (let i = 0; i < nms.length; i++) {
		if (nms[i] >= hi) {
			edges[i] = 255;
			queue.push(i);
		}
	}

	let head = 0;
	while (head < queue.length) {
		const idx = queue[head++];
		const px = idx % w;
		const py = (idx / w) | 0;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = px + dx, ny = py + dy;
				if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
				const ni = ny * w + nx;
				if (!edges[ni] && nms[ni] >= lo) {
					edges[ni] = 255;
					queue.push(ni);
				}
			}
		}
	}

	return edges;
}

// ═══════════════════════════════════════════════════════════════════════
// MORPHOLOGICAL & THRESHOLD
// ═══════════════════════════════════════════════════════════════════════

function dilate(src: Uint8Array, w: number, h: number, iterations: number): Uint8Array {
	let cur = src;
	for (let iter = 0; iter < iterations; iter++) {
		const dst = new Uint8Array(w * h);
		for (let y = 1; y < h - 1; y++) {
			for (let x = 1; x < w - 1; x++) {
				if (
					cur[y * w + x] ||
					cur[(y - 1) * w + x - 1] || cur[(y - 1) * w + x] || cur[(y - 1) * w + x + 1] ||
					cur[y * w + x - 1] || cur[y * w + x + 1] ||
					cur[(y + 1) * w + x - 1] || cur[(y + 1) * w + x] || cur[(y + 1) * w + x + 1]
				) {
					dst[y * w + x] = 255;
				}
			}
		}
		cur = dst;
	}
	return cur;
}

function erode(src: Uint8Array, w: number, h: number, iterations: number): Uint8Array {
	let cur = src;
	for (let iter = 0; iter < iterations; iter++) {
		const dst = new Uint8Array(w * h);
		for (let y = 1; y < h - 1; y++) {
			for (let x = 1; x < w - 1; x++) {
				let keep = 255;
				for (let dy = -1; dy <= 1 && keep; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (!cur[(y + dy) * w + x + dx]) {
							keep = 0;
							break;
						}
					}
				}
				dst[y * w + x] = keep;
			}
		}
		cur = dst;
	}
	return cur;
}

function closeMask(src: Uint8Array, w: number, h: number, iterations: number): Uint8Array {
	return erode(dilate(src, w, h, iterations), w, h, iterations);
}

/** Adaptive threshold using integral image */
function adaptiveThreshold(
	gray: Uint8Array, w: number, h: number,
	blockSize: number, C: number
): Uint8Array {
	const half = (blockSize - 1) >> 1;
	const out = new Uint8Array(w * h);
	const iw = w + 1;

	// Integral image
	const integral = new Float64Array(iw * (h + 1));
	for (let y = 0; y < h; y++) {
		let rowSum = 0;
		for (let x = 0; x < w; x++) {
			rowSum += gray[y * w + x];
			integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + rowSum;
		}
	}

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const x1 = Math.max(0, x - half);
			const y1 = Math.max(0, y - half);
			const x2 = Math.min(w - 1, x + half);
			const y2 = Math.min(h - 1, y + half);
			const count = (x2 - x1 + 1) * (y2 - y1 + 1);
			const sum =
				integral[(y2 + 1) * iw + x2 + 1] -
				integral[y1 * iw + x2 + 1] -
				integral[(y2 + 1) * iw + x1] +
				integral[y1 * iw + x1];
			out[y * w + x] = gray[y * w + x] < (sum / count) - C ? 255 : 0;
		}
	}
	return out;
}

// ═══════════════════════════════════════════════════════════════════════
// FLOOD FILL FROM BORDER (find enclosed regions)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Flood fill from all image border pixels through non-barrier areas.
 * Returns mask: 1 = reachable from border ("outside"), 0 = interior/barrier.
 */
function floodFillFromBorder(barrier: Uint8Array, w: number, h: number): Uint8Array {
	const outside = new Uint8Array(w * h);
	const queue = new Int32Array(w * h);
	let head = 0, tail = 0;

	const seed = (idx: number) => {
		if (!outside[idx] && !barrier[idx]) {
			outside[idx] = 1;
			queue[tail++] = idx;
		}
	};

	// Seed from all border pixels
	for (let x = 0; x < w; x++) {
		seed(x);
		seed((h - 1) * w + x);
	}
	for (let y = 1; y < h - 1; y++) {
		seed(y * w);
		seed(y * w + w - 1);
	}

	// BFS with 8-connectivity
	while (head < tail) {
		const idx = queue[head++];
		const px = idx % w;
		const py = (idx / w) | 0;

		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = px + dx, ny = py + dy;
				if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
				const ni = ny * w + nx;
				if (!outside[ni] && !barrier[ni]) {
					outside[ni] = 1;
					queue[tail++] = ni;
				}
			}
		}
	}

	return outside;
}

// ═══════════════════════════════════════════════════════════════════════
// FIND LARGEST INTERIOR BLOB
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find the largest connected component of pixels NOT marked "outside".
 * Returns the boundary points of that component.
 */
function findLargestInteriorBlob(outside: Uint8Array, w: number, h: number): Pt[] {
	const visited = new Uint8Array(w * h);
	const queue = new Int32Array(w * h);
	let bestBoundary: Pt[] = [];
	let bestSize = 0;
	const total = w * h;

	for (let startIdx = 0; startIdx < total; startIdx++) {
		if (visited[startIdx] || outside[startIdx]) continue;

		let head = 0, tail = 0;
		let size = 0;
		const boundary: Pt[] = [];
		queue[tail++] = startIdx;
		visited[startIdx] = 1;

		while (head < tail) {
			const idx = queue[head++];
			size++;
			const cx = idx % w;
			const cy = (idx / w) | 0;
			let isBoundary = false;

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = cx + dx, ny = cy + dy;
					if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
						isBoundary = true;
						continue;
					}
					const ni = ny * w + nx;
					if (outside[ni]) {
						isBoundary = true;
					} else if (!visited[ni]) {
						visited[ni] = 1;
						queue[tail++] = ni;
					}
				}
			}

			if (isBoundary) boundary.push({ x: cx, y: cy });
		}

		if (size > bestSize) {
			bestSize = size;
			bestBoundary = boundary;
		}
	}

	return bestBoundary;
}

function findLargestForegroundBlob(mask: Uint8Array, w: number, h: number): Pt[] {
	const visited = new Uint8Array(w * h);
	const queue = new Int32Array(w * h);
	let bestBoundary: Pt[] = [];
	let bestScore = 0;
	const total = w * h;
	const centerX = w / 2;
	const centerY = h / 2;

	for (let startIdx = 0; startIdx < total; startIdx++) {
		if (visited[startIdx] || !mask[startIdx]) continue;

		let head = 0;
		let tail = 0;
		let size = 0;
		let sumX = 0;
		let sumY = 0;
		const boundary: Pt[] = [];
		queue[tail++] = startIdx;
		visited[startIdx] = 1;

		while (head < tail) {
			const idx = queue[head++];
			size++;
			const cx = idx % w;
			const cy = (idx / w) | 0;
			sumX += cx;
			sumY += cy;
			let isBoundary = false;

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = cx + dx;
					const ny = cy + dy;
					if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
						isBoundary = true;
						continue;
					}
					const ni = ny * w + nx;
					if (!mask[ni]) {
						isBoundary = true;
					} else if (!visited[ni]) {
						visited[ni] = 1;
						queue[tail++] = ni;
					}
				}
			}

			if (isBoundary) boundary.push({ x: cx, y: cy });
		}

		if (size < total * MIN_BLOB_RATIO || boundary.length < 8) continue;

		const blobCx = sumX / size;
		const blobCy = sumY / size;
		const centerDist = Math.hypot(blobCx - centerX, blobCy - centerY) / Math.hypot(centerX, centerY);
		const centrality = Math.max(0.55, 1 - centerDist * 0.45);
		const score = size * centrality;
		if (score > bestScore) {
			bestScore = score;
			bestBoundary = boundary;
		}
	}

	return bestBoundary;
}

// ═══════════════════════════════════════════════════════════════════════
// CONVEX HULL (Andrew's monotone chain)
// ═══════════════════════════════════════════════════════════════════════

function crossProduct(o: Pt, a: Pt, b: Pt): number {
	return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: Pt[]): Pt[] {
	if (points.length <= 3) return points.slice();

	const sorted = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
	const n = sorted.length;

	const lower: Pt[] = [];
	for (let i = 0; i < n; i++) {
		while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0)
			lower.pop();
		lower.push(sorted[i]);
	}

	const upper: Pt[] = [];
	for (let i = n - 1; i >= 0; i--) {
		while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0)
			upper.pop();
		upper.push(sorted[i]);
	}

	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

// ═══════════════════════════════════════════════════════════════════════
// POLYGON SIMPLIFICATION & QUAD FITTING
// ═══════════════════════════════════════════════════════════════════════

function pointToLineDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b.x - a.x, dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function douglasPeucker(pts: Pt[], eps: number): Pt[] {
	if (pts.length <= 2) return pts;
	let maxD = 0, maxI = 0;
	const first = pts[0], last = pts[pts.length - 1];
	for (let i = 1; i < pts.length - 1; i++) {
		const d = pointToLineDist(pts[i], first, last);
		if (d > maxD) { maxD = d; maxI = i; }
	}
	if (maxD > eps) {
		const left = douglasPeucker(pts.slice(0, maxI + 1), eps);
		const right = douglasPeucker(pts.slice(maxI), eps);
		return [...left.slice(0, -1), ...right];
	}
	return [first, last];
}

function simplifyClosedPolygon(hull: Pt[], eps: number): Pt[] {
	if (hull.length < 4) return hull;
	const closed = [...hull, hull[0]];
	const simplified = douglasPeucker(closed, eps);
	if (
		simplified.length > 1 &&
		simplified[0].x === simplified[simplified.length - 1].x &&
		simplified[0].y === simplified[simplified.length - 1].y
	) simplified.pop();
	return simplified;
}

function polygonPerimeter(pts: Pt[]): number {
	let p = 0;
	for (let i = 0; i < pts.length; i++) {
		const j = (i + 1) % pts.length;
		p += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
	}
	return p;
}

function cornerAngle(a: Pt, b: Pt, c: Pt): number {
	const v1x = a.x - b.x, v1y = a.y - b.y;
	const v2x = c.x - b.x, v2y = c.y - b.y;
	const dot = v1x * v2x + v1y * v2y;
	const len1 = Math.hypot(v1x, v1y);
	const len2 = Math.hypot(v2x, v2y);
	if (len1 === 0 || len2 === 0) return 180;
	return Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2)))) * 57.29578;
}

/**
 * Fit a convex hull to exactly 4 corners.
 * Tries progressive DP simplification, then evaluates plausible 4-point subsets
 * before falling back to a sharp-corner heuristic.
 */
function fitToQuad(hull: Pt[], frameW: number, frameH: number): [Pt, Pt, Pt, Pt] | null {
	if (hull.length < 4) return null;
	if (hull.length === 4) return orderQuadPoints(hull);

	const perim = polygonPerimeter(hull);

	for (const factor of [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10]) {
		const simplified = simplifyClosedPolygon(hull, perim * factor);
		if (simplified.length === 4) return orderQuadPoints(simplified);
		if (simplified.length >= 4 && simplified.length <= 12) {
			const quad = selectBestQuadFromPolygon(simplified, frameW, frameH, hull);
			if (quad) return quad;
		}
		if (simplified.length < 4) break;
	}

	const reducedHull = reducePolygonForQuadSearch(hull);
	return selectBestQuadFromPolygon(reducedHull, frameW, frameH, hull)
		?? findSharpestFourCorners(hull, frameW, frameH);
}

function findSharpestFourCorners(poly: Pt[], frameW: number, frameH: number): [Pt, Pt, Pt, Pt] | null {
	const n = poly.length;
	if (n < 4) return null;

	const ranked: { i: number; angle: number }[] = [];
	for (let i = 0; i < n; i++) {
		const prev = poly[(i - 1 + n) % n];
		const curr = poly[i];
		const next = poly[(i + 1) % n];
		ranked.push({ i, angle: cornerAngle(prev, curr, next) });
	}

	ranked.sort((a, b) => a.angle - b.angle);

	// Pick 4 sharpest that are reasonably spread apart
	const picks: number[] = [ranked[0].i];
	for (let r = 1; r < ranked.length && picks.length < 4; r++) {
		const candidate = ranked[r].i;
		// Ensure minimum separation along the hull (at least n/8 apart from all picked)
		const minSep = Math.max(2, n / 8);
		const tooClose = picks.some(p => {
			const d = Math.min(Math.abs(candidate - p), n - Math.abs(candidate - p));
			return d < minSep;
		});
		if (!tooClose) picks.push(candidate);
	}

	if (picks.length < 4) {
		// Fall back to just taking top 4 regardless of separation
		const top4 = ranked
			.slice(0, Math.min(8, ranked.length))
			.map(r => poly[r.i]);
		return selectBestQuadFromPolygon(top4, frameW, frameH, poly) ?? orderQuadPoints(top4.slice(0, 4));
	}

	return selectBestQuadFromPolygon(picks.map(i => poly[i]), frameW, frameH, poly)
		?? orderQuadPoints(picks.map(i => poly[i]));
}

function reducePolygonForQuadSearch(poly: Pt[], maxPts = 12): Pt[] {
	if (poly.length <= maxPts) return poly;

	const n = poly.length;
	const ranked: { i: number; angle: number }[] = [];
	for (let i = 0; i < n; i++) {
		const prev = poly[(i - 1 + n) % n];
		const curr = poly[i];
		const next = poly[(i + 1) % n];
		ranked.push({ i, angle: cornerAngle(prev, curr, next) });
	}

	ranked.sort((a, b) => a.angle - b.angle);
	const keep = ranked
		.slice(0, maxPts)
		.map(entry => entry.i)
		.sort((a, b) => a - b);
	return keep.map(i => poly[i]);
}

function selectBestQuadFromPolygon(
	poly: Pt[],
	frameW: number,
	frameH: number,
	supportPts: Pt[] = poly
): [Pt, Pt, Pt, Pt] | null {
	if (poly.length < 4) return null;

	let bestQuad: [Pt, Pt, Pt, Pt] | null = null;
	let bestScore = 0;

	for (let i = 0; i < poly.length - 3; i++) {
		for (let j = i + 1; j < poly.length - 2; j++) {
			for (let k = j + 1; k < poly.length - 1; k++) {
				for (let l = k + 1; l < poly.length; l++) {
					const quad = orderQuadPoints([poly[i], poly[j], poly[k], poly[l]]);
					if (!isConvex(quad)) continue;
					const geometryScore = scoreQuadGeometry(quad, frameW, frameH);
					if (geometryScore === 0) continue;
					const supportScore = scoreQuadHullAlignment(quad, supportPts, frameW, frameH);
					const score = geometryScore * 0.72 + supportScore * 0.28;
					if (score > bestScore) {
						bestQuad = quad;
						bestScore = score;
					}
				}
			}
		}
	}

	return bestQuad;
}

function scoreQuadHullAlignment(
	corners: [Pt, Pt, Pt, Pt],
	supportPts: Pt[],
	frameW: number,
	frameH: number
): number {
	if (supportPts.length === 0) return 0;

	const tolerance = Math.max(3, Math.min(frameW, frameH) * 0.018);
	const edgeHits = [0, 0, 0, 0];
	let totalHits = 0;

	for (const p of supportPts) {
		let bestEdge = -1;
		let bestDist = Infinity;
		for (let i = 0; i < 4; i++) {
			const d = pointToLineDist(p, corners[i], corners[(i + 1) % 4]);
			if (d < bestDist) {
				bestDist = d;
				bestEdge = i;
			}
		}

		if (bestEdge >= 0 && bestDist <= tolerance) {
			totalHits++;
			edgeHits[bestEdge]++;
		}
	}

	const overallCoverage = totalHits / supportPts.length;
	const balancedCoverage = edgeHits.reduce(
		(sum, hits) => sum + Math.min(1, hits / Math.max(2, supportPts.length * 0.08)),
		0,
	) / 4;

	return overallCoverage * 0.7 + balancedCoverage * 0.3;
}

// ═══════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════

function polygonArea(pts: Pt[]): number {
	let a = 0;
	for (let i = 0; i < pts.length; i++) {
		const j = (i + 1) % pts.length;
		a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
	}
	return Math.abs(a) / 2;
}

function isConvex(pts: Pt[]): boolean {
	const n = pts.length;
	let sign = 0;
	for (let i = 0; i < n; i++) {
		const c = crossProduct(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]);
		if (c !== 0) {
			if (sign === 0) sign = c > 0 ? 1 : -1;
			else if ((c > 0 ? 1 : -1) !== sign) return false;
		}
	}
	return true;
}

/** Order 4 points: top-left, top-right, bottom-right, bottom-left */
function orderQuadPoints(pts: Pt[]): [Pt, Pt, Pt, Pt] {
	const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
	const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
	const sorted = pts
		.slice()
		.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

	let start = 0;
	let best = Infinity;
	for (let i = 0; i < sorted.length; i++) {
		const score = sorted[i].x + sorted[i].y;
		if (score < best) {
			best = score;
			start = i;
		}
	}

	let ordered = [
		sorted[start],
		sorted[(start + 1) % sorted.length],
		sorted[(start + 2) % sorted.length],
		sorted[(start + 3) % sorted.length],
	] as [Pt, Pt, Pt, Pt];

	if (crossProduct(ordered[0], ordered[1], ordered[2]) < 0) {
		ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
	}

	return ordered;
}

// ═══════════════════════════════════════════════════════════════════════
// QUAD SCORING
// ═══════════════════════════════════════════════════════════════════════

function scoreQuadGeometry(corners: [Pt, Pt, Pt, Pt], frameW: number, frameH: number): number {
	const area = polygonArea(corners);
	const frameArea = frameW * frameH;
	const areaRatio = area / frameArea;

	if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) return 0;

	// Angle score: how close to 90° are the corners?
	let angleScore = 0;
	for (let i = 0; i < 4; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % 4];
		const c = corners[(i + 2) % 4];
		const angle = cornerAngle(a, b, c);
		if (angle < MIN_CORNER_ANGLE || angle > MAX_CORNER_ANGLE) return 0;
		angleScore += 1 - Math.abs(angle - 90) / 90;
	}
	angleScore /= 4;

	// Area: prefer larger (more likely the document)
	const areaScore = Math.min(areaRatio * 1.5, 1);

	// Convexity
	const convexScore = isConvex(corners) ? 1 : 0.4;

	// Aspect ratio: penalize extreme ratios (>4:1 unlikely for documents)
	const edgeLens: number[] = [];
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		edgeLens.push(Math.hypot(corners[j].x - corners[i].x, corners[j].y - corners[i].y));
	}
	const avgW = (edgeLens[0] + edgeLens[2]) / 2;
	const avgH = (edgeLens[1] + edgeLens[3]) / 2;
	const aspect = Math.max(avgW, avgH) / (Math.min(avgW, avgH) || 1);
	const aspectScore = aspect <= 3 ? 1 : Math.max(0, 1 - (aspect - 3) * 0.25);

	const oppositeEdgeScore = (
		scoreLengthSimilarity(edgeLens[0], edgeLens[2]) +
		scoreLengthSimilarity(edgeLens[1], edgeLens[3])
	) / 2;

	const parallelismScore = (
		scoreParallelEdges(corners[0], corners[1], corners[2], corners[3]) +
		scoreParallelEdges(corners[1], corners[2], corners[3], corners[0])
	) / 2;

	return angleScore * 0.24
		+ areaScore * 0.14
		+ convexScore * 0.12
		+ aspectScore * 0.14
		+ oppositeEdgeScore * 0.14
		+ parallelismScore * 0.22;
}

function scoreLengthSimilarity(a: number, b: number): number {
	const longer = Math.max(a, b);
	const shorter = Math.min(a, b);
	if (longer < 1e-6) return 0;
	const ratio = shorter / longer;
	return ratio >= 0.35 ? 1 : ratio / 0.35;
}

function scoreParallelEdges(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
	const vaX = a2.x - a1.x;
	const vaY = a2.y - a1.y;
	const vbX = b2.x - b1.x;
	const vbY = b2.y - b1.y;
	const lenA = Math.hypot(vaX, vaY);
	const lenB = Math.hypot(vbX, vbY);
	if (lenA < 1e-6 || lenB < 1e-6) return 0;
	const cos = Math.abs((vaX * vbX + vaY * vbY) / (lenA * lenB));
	const angleDiff = Math.acos(Math.max(-1, Math.min(1, cos)));
	const fortyDegrees = 40 * Math.PI / 180;
	return Math.max(0, 1 - angleDiff / fortyDegrees);
}

function expandQuadOutward(
	corners: [Pt, Pt, Pt, Pt],
	frameW: number,
	frameH: number
): [Pt, Pt, Pt, Pt] {
	const center = {
		x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
		y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
	};
	const areaRatio = polygonArea(corners) / (frameW * frameH);
	// Minimal expansion — just enough to avoid sub-pixel clipping
	const padPx = Math.max(
		1,
		Math.min(Math.min(frameW, frameH) * 0.008, Math.min(frameW, frameH) * (0.003 + areaRatio * 0.005)),
	);

	const expanded = corners.map((corner) => {
		const vx = corner.x - center.x;
		const vy = corner.y - center.y;
		const len = Math.hypot(vx, vy);
		if (len < 1e-6) return { ...corner };
		const scale = (len + padPx) / len;
		return {
			x: Math.max(0, Math.min(frameW - 1, center.x + vx * scale)),
			y: Math.max(0, Math.min(frameH - 1, center.y + vy * scale)),
		};
	});

	// Snap corners very near frame edges to the edge (close-up only)
	const snapDist = Math.max(2, Math.min(frameW, frameH) * 0.012);
	for (const p of expanded) {
		if (p.x < snapDist) p.x = 0;
		if (p.y < snapDist) p.y = 0;
		if (p.x > frameW - 1 - snapDist) p.x = frameW - 1;
		if (p.y > frameH - 1 - snapDist) p.y = frameH - 1;
	}

	return orderQuadPoints(expanded) as [Pt, Pt, Pt, Pt];
}

function sampleBestEdgeResponse(
	cx: number,
	cy: number,
	nx: number,
	ny: number,
	field: GradientField,
	w: number,
	h: number,
	corridor: number
): { mag: number; align: number; score: number; x: number; y: number } {
	let bestMag = 0;
	let bestAlign = 0;
	let bestScore = 0;
	let bestX = cx;
	let bestY = cy;

	for (let d = -corridor; d <= corridor; d += 0.5) {
		const sx = cx + nx * d;
		const sy = cy + ny * d;
		const ix = Math.round(sx);
		const iy = Math.round(sy);
		if (ix < 1 || ix >= w - 1 || iy < 1 || iy >= h - 1) continue;

		const idx = iy * w + ix;
		const mag = field.mag[idx];
		if (mag < 1) continue;

		const align = Math.abs((field.gx[idx] * nx + field.gy[idx] * ny) / mag);
		const distancePenalty = 1 - 0.35 * (Math.abs(d) / Math.max(1, corridor));
		const score = mag * (0.25 + 0.75 * align) * distancePenalty;
		if (score > bestScore) {
			bestScore = score;
			bestMag = mag;
			bestAlign = align;
			bestX = sx;
			bestY = sy;
		}
	}

	return { mag: bestMag, align: bestAlign, score: bestScore, x: bestX, y: bestY };
}

function scoreQuadEdgeSupport(
	corners: [Pt, Pt, Pt, Pt],
	field: GradientField,
	w: number,
	h: number
): number {
	const corridor = Math.max(3, Math.min(w, h) * 0.02);
	let supportHits = 0;
	let strength = 0;
	let total = 0;

	for (let i = 0; i < 4; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % 4];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < 4) continue;

		const tx = dx / len;
		const ty = dy / len;
		const nx = -ty;
		const ny = tx;
		const samples = Math.min(48, Math.max(12, Math.round(len / 3)));

		for (let s = 0; s < samples; s++) {
			const t = (s + 0.5) / samples;
			const cx = a.x + dx * t;
			const cy = a.y + dy * t;
			const response = sampleBestEdgeResponse(cx, cy, nx, ny, field, w, h, corridor);
			total++;
			strength += Math.min(1, response.score / 110);
			if (response.mag > 18 && response.align > 0.45) supportHits++;
		}
	}

	if (total === 0) return 0;
	return (supportHits / total) * 0.65 + (strength / total) * 0.35;
}

function sampleGray(gray: Uint8Array, w: number, h: number, x: number, y: number): number | null {
	const ix = Math.round(x);
	const iy = Math.round(y);
	if (ix < 0 || ix >= w || iy < 0 || iy >= h) return null;
	return gray[iy * w + ix];
}

function scoreQuadBoundaryContrast(
	corners: [Pt, Pt, Pt, Pt],
	gray: Uint8Array,
	w: number,
	h: number
): number {
	const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
	const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;
	// Sample further from the edge to get a clear inside-vs-outside read
	const insideOffset = Math.max(6, Math.min(w, h) * 0.025);
	const outsideOffset = insideOffset * 1.6;
	let totalScore = 0;
	let usedEdges = 0;
	let worstEdge = Infinity;

	for (let i = 0; i < 4; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % 4];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < 6) continue;

		let nx = -dy / len;
		let ny = dx / len;
		const mx = (a.x + b.x) * 0.5;
		const my = (a.y + b.y) * 0.5;
		if ((cx - mx) * nx + (cy - my) * ny < 0) {
			nx = -nx;
			ny = -ny;
		}

		// Check if this edge is near the frame border — if so, outside samples
		// may fall outside the image, which is fine (paper extends past frame)
		const edgeNearBorder =
			(Math.abs(a.y) < 4 && Math.abs(b.y) < 4) || // top
			(Math.abs(a.y - (h - 1)) < 4 && Math.abs(b.y - (h - 1)) < 4) || // bottom
			(Math.abs(a.x) < 4 && Math.abs(b.x) < 4) || // left
			(Math.abs(a.x - (w - 1)) < 4 && Math.abs(b.x - (w - 1)) < 4); // right

		const samples = Math.min(40, Math.max(12, Math.round(len / 5)));
		let edgeContrast = 0;
		let strongHits = 0;
		let usedSamples = 0;

		for (let s = 0; s < samples; s++) {
			const t = (s + 1) / (samples + 1);
			const px = a.x + dx * t;
			const py = a.y + dy * t;
			const inside = sampleGray(gray, w, h, px + nx * insideOffset, py + ny * insideOffset);
			const outside = sampleGray(gray, w, h, px - nx * outsideOffset, py - ny * outsideOffset);
			if (inside === null || outside === null) continue;

			const contrast = Math.abs(inside - outside) / 255;
			edgeContrast += Math.min(1, contrast / 0.15);
			if (contrast >= 0.06) strongHits++;
			usedSamples++;
		}

		if (usedSamples === 0) {
			// Edge is entirely at the frame border — treat as OK for close-up
			if (edgeNearBorder) {
				usedEdges++;
				totalScore += 0.6;
				continue;
			}
			continue;
		}

		const edgeScore = (edgeContrast / usedSamples) * 0.65 + (strongHits / usedSamples) * 0.35;
		totalScore += edgeScore;
		usedEdges++;
		if (edgeScore < worstEdge) worstEdge = edgeScore;
	}

	if (usedEdges === 0) return 0;
	let avg = totalScore / usedEdges;

	// Heavy penalty if ANY edge has very low contrast — likely cutting through
	// the paper or extending past it into a same-brightness object
	if (worstEdge < 0.15) avg *= 0.25;
	else if (worstEdge < 0.3) avg *= 0.55;

	return avg;
}

function scoreQuad(
	corners: [Pt, Pt, Pt, Pt],
	frameW: number,
	frameH: number,
	field: GradientField | null,
	gray: Uint8Array | null
): number {
	const geometryScore = scoreQuadGeometry(corners, frameW, frameH);
	if (geometryScore === 0) return 0;

	const edgeScore = field ? scoreQuadEdgeSupport(corners, field, frameW, frameH) : geometryScore;
	const contrastScore = gray ? scoreQuadBoundaryContrast(corners, gray, frameW, frameH) : geometryScore;

	return geometryScore * 0.28 + edgeScore * 0.28 + contrastScore * 0.44;
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION PIPELINE (single pass)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// GRADIENT-BASED CORNER REFINEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute Sobel gradient field at each pixel.
 * Reusable across refinement calls and edge-aware scoring for the same frame.
 */
function sobelField(gray: Uint8Array, w: number, h: number): GradientField {
	const gx = new Float32Array(w * h);
	const gy = new Float32Array(w * h);
	const mag = new Float32Array(w * h);
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const gradX =
				-gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x + 1]
				- 2 * gray[y * w + x - 1] + 2 * gray[y * w + x + 1]
				- gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x + 1];
			const gradY =
				-gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1]
				+ gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
			const i = y * w + x;
			gx[i] = gradX;
			gy[i] = gradY;
			mag[i] = Math.sqrt(gradX * gradX + gradY * gradY);
		}
	}
	return { gx, gy, mag };
}

/**
 * Sample points along a line segment, perpendicular-search for the
 * strongest gradient within a corridor, and fit a least-squares line
 * through those edge points.
 */
function fitEdgeLine(
	p1: Pt, p2: Pt,
	field: GradientField,
	w: number, h: number,
	corridor: number
): Line | null {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const len = Math.hypot(dx, dy);
	if (len < 4) return null;

	// Unit tangent and perpendicular (inward)
	const tx = dx / len, ty = dy / len;
	const nx = -ty, ny = tx; // perpendicular

	const NUM_SAMPLES = Math.min(60, Math.max(14, Math.round(len * 1.5)));
	const edgePts: Pt[] = [];

	for (let s = 0; s < NUM_SAMPLES; s++) {
		const t = (s + 0.5) / NUM_SAMPLES;
		const cx = p1.x + dx * t;
		const cy = p1.y + dy * t;

		const response = sampleBestEdgeResponse(cx, cy, nx, ny, field, w, h, corridor);
		if (response.mag > 18 && response.align > 0.4) {
			edgePts.push({ x: response.x, y: response.y });
		}
	}

	if (edgePts.length < 3) return null;

	return robustLineFit(edgePts);
}

/**
 * Deterministic robust line fit: iteratively refit after trimming outliers.
 * This avoids frame-to-frame jitter from random sampling.
 */
function robustLineFit(pts: Pt[]): Line | null {
	if (pts.length < 3) return null;

	let inliers = pts.slice();
	let line = leastSquaresLine(inliers);

	for (let iter = 0; iter < 4; iter++) {
		const distances = inliers.map(p => distToLine(p, line)).sort((a, b) => a - b);
		const median = distances[Math.floor(distances.length / 2)] ?? 0;
		const threshold = Math.max(1.0, Math.min(3.0, median * 2.0 + 0.3));
		const next = inliers.filter(p => distToLine(p, line) <= threshold);
		if (next.length < 3 || next.length === inliers.length) break;
		inliers = next;
		line = leastSquaresLine(inliers);
	}

	return leastSquaresLine(inliers);
}

function distToLine(p: Pt, l: Line): number {
	return Math.abs(l.a * p.x + l.b * p.y + l.c);
}

function leastSquaresLine(pts: Pt[]): Line {
	const n = pts.length;
	let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
	for (const p of pts) {
		sx += p.x; sy += p.y;
		sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
	}

	// Use the eigenvector approach (PCA) for orientation-independent fit
	const mx = sx / n, my = sy / n;
	let cxx = 0, cxy = 0, cyy = 0;
	for (const p of pts) {
		const dx = p.x - mx, dy = p.y - my;
		cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
	}

	// Eigenvector of covariance matrix → line direction
	const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
	const a = -Math.sin(theta);
	const b = Math.cos(theta);
	const c = -(a * mx + b * my);
	return { a, b, c };
}

/** Intersect two lines. Returns null if parallel. */
function intersectLines(l1: Line, l2: Line): Pt | null {
	const det = l1.a * l2.b - l2.a * l1.b;
	if (Math.abs(det) < 1e-8) return null;
	return {
		x: (l1.b * l2.c - l2.b * l1.c) / det,
		y: (l2.a * l1.c - l1.a * l2.c) / det,
	};
}

/**
 * Refine a rough quad using gradient-based edge line fitting.
 * For each side: find the strongest edge line, then intersect
 * adjacent lines for precise corners.
 */
function refineQuadCorners(
	quad: [Pt, Pt, Pt, Pt],
	field: GradientField,
	w: number, h: number
): [Pt, Pt, Pt, Pt] {
	// Sides: tl→tr, tr→br, br→bl, bl→tl
	const sides: [Pt, Pt][] = [
		[quad[0], quad[1]], // top
		[quad[1], quad[2]], // right
		[quad[2], quad[3]], // bottom
		[quad[3], quad[0]], // left
	];

	const corridor = Math.max(4, Math.min(w, h) * 0.025);
	const lines: (Line | null)[] = sides.map(([a, b]) =>
		fitEdgeLine(a, b, field, w, h, corridor)
	);

	// If all 4 lines fitted, intersect them for precise corners
	const refined: Pt[] = [];
	const maxShift = Math.max(8, Math.min(w, h) * 0.08);
	for (let i = 0; i < 4; i++) {
		const lineA = lines[(i + 3) % 4]; // side ending at this corner
		const lineB = lines[i];            // side starting at this corner
		if (lineA && lineB) {
			const pt = intersectLines(lineA, lineB);
			if (
				pt &&
				pt.x >= -10 &&
				pt.x <= w + 10 &&
				pt.y >= -10 &&
				pt.y <= h + 10 &&
				Math.hypot(pt.x - quad[i].x, pt.y - quad[i].y) <= maxShift
			) {
				refined.push(pt);
				continue;
			}
		}
		// Fallback: keep original corner
		refined.push(quad[i]);
	}

	// Clamp to image bounds
	for (const p of refined) {
		p.x = Math.max(0, Math.min(w - 1, p.x));
		p.y = Math.max(0, Math.min(h - 1, p.y));
	}

	return orderQuadPoints(refined) as [Pt, Pt, Pt, Pt];
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION PIPELINE (single pass)
// ═══════════════════════════════════════════════════════════════════════

/**
 * One detection pass: binary edge map → dilate → flood fill from border →
 * biggest interior blob → hull → quad.
 */
function detectQuadFromBinaryMap(
	binary: Uint8Array, w: number, h: number, dilateIter: number,
	gradientField: GradientField | null,
	gray: Uint8Array | null
): ScoredQuad | null {
	const dilated = dilate(binary, w, h, dilateIter);

	// Clear only a minimal border margin so close-up pages near the frame edge
	// are still eligible candidates.
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (x < BORDER_CLEAR_PX || x >= w - BORDER_CLEAR_PX || y < BORDER_CLEAR_PX || y >= h - BORDER_CLEAR_PX)
				dilated[y * w + x] = 0;
		}
	}

	const outside = floodFillFromBorder(dilated, w, h);

	// Quick check: meaningful interior?
	let interiorCount = 0;
	const totalPixels = w * h;
	for (let i = 0; i < totalPixels; i++) {
		if (!outside[i]) interiorCount++;
	}
	if (interiorCount < totalPixels * MIN_BLOB_RATIO) return null;
	if (interiorCount > totalPixels * 0.998) return null; // fill leaked

	const boundary = findLargestInteriorBlob(outside, w, h);
	if (boundary.length < 8) return null;

	const hull = convexHull(boundary);
	if (hull.length < 4) return null;

	let quad = fitToQuad(hull, w, h);
	if (!quad) return null;

	let score = scoreQuad(quad, w, h, gradientField, gray);

	// Refine corners using gradient edge fitting, but only keep the refinement
	// when it actually improves the candidate.
	if (gradientField) {
		const refined = refineQuadCorners(quad, gradientField, w, h);
		const refinedScore = scoreQuad(refined, w, h, gradientField, gray);
		if (refinedScore >= score * 0.98) {
			quad = refined;
			score = refinedScore;
		}
	}

	if (score < MIN_SCORE) return null;

	return { corners: quad, score };
}

function detectQuadFromForegroundMask(
	mask: Uint8Array,
	w: number,
	h: number,
	gradientField: GradientField | null,
	gray: Uint8Array | null
): ScoredQuad | null {
	const cleaned = closeMask(mask, w, h, 2);

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (x < BORDER_CLEAR_PX || x >= w - BORDER_CLEAR_PX || y < BORDER_CLEAR_PX || y >= h - BORDER_CLEAR_PX)
				cleaned[y * w + x] = 0;
		}
	}

	const boundary = findLargestForegroundBlob(cleaned, w, h);
	if (boundary.length < 8) return null;

	const hull = convexHull(boundary);
	if (hull.length < 4) return null;

	let quad = fitToQuad(hull, w, h);
	if (!quad) return null;

	let score = scoreQuad(quad, w, h, gradientField, gray);
	if (gradientField) {
		const refined = refineQuadCorners(quad, gradientField, w, h);
		const refinedScore = scoreQuad(refined, w, h, gradientField, gray);
		if (refinedScore >= score * 0.98) {
			quad = refined;
			score = refinedScore;
		}
	}

	if (score < MIN_SCORE) return null;
	return { corners: quad, score };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN DETECTION (multi-strategy)
// ═══════════════════════════════════════════════════════════════════════

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvas(w: number, h: number) {
	if (!_canvas || _canvas.width !== w || _canvas.height !== h) {
		_canvas = document.createElement('canvas');
		_canvas.width = w;
		_canvas.height = h;
		_ctx = _canvas.getContext('2d', { willReadFrequently: true })!;
	}
	return _ctx!;
}

function detectAtResolution(
	source: HTMLVideoElement | ImageBitmap,
	maxSize: number,
	realtime = false
): DetectionResult {
	const vw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
	const vh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
	if (vw === 0 || vh === 0) return { quad: null, confidence: 0 };

	const scale = Math.min(1, maxSize / Math.max(vw, vh));
	const w = Math.round(vw * scale);
	const h = Math.round(vh * scale);

	const ctx = getCanvas(w, h);
	ctx.drawImage(source, 0, 0, w, h);
	const imageData = ctx.getImageData(0, 0, w, h);

	const gray = toGrayscale(imageData.data, w, h);
	const blurred = gaussianBlur(gray, w, h);

	// CLAHE for low-contrast enhancement
	const enhanced = clahe(blurred, w, h, 8, 8, 2.5);
	const enhancedBlurred = gaussianBlur(enhanced, w, h);

	// Extract color channels for color-based edge detection
	const channels = extractChannels(imageData.data, w, h);
	const blurredChannels: [Uint8Array, Uint8Array, Uint8Array] = [
		gaussianBlur(channels[0], w, h),
		gaussianBlur(channels[1], w, h),
		gaussianBlur(channels[2], w, h),
	];
	const paperScore = computePaperScore(imageData.data, w, h);

	// Pre-compute gradient field for corner refinement and edge-aware scoring.
	const gradientField = sobelField(enhancedBlurred, w, h);

	const HIGH_CONFIDENCE = 0.6;
	const candidates: ScoredQuad[] = [];

	const maybeReturn = (): DetectionResult | null => {
		if (!realtime || candidates.length === 0) return null;
		const best = candidates.reduce((a, b) => b.score > a.score ? b : a);
		if (best.score >= HIGH_CONFIDENCE) return makeResult(best, w, h);
		return null;
	};

	const paperMask = thresholdPaperMask(paperScore, w, h);
	const paperQuad = detectQuadFromForegroundMask(paperMask, w, h, gradientField, blurred);
	if (paperQuad) candidates.push(paperQuad);
	{ const r = maybeReturn(); if (r) return r; }

	// Also try eroded paper mask (separates paper from nearby bright objects like phone screens)
	const erodedPaperMask = erode(paperMask, w, h, 3);
	const erodedQuad = detectQuadFromForegroundMask(erodedPaperMask, w, h, gradientField, blurred);
	if (erodedQuad) candidates.push(erodedQuad);
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy A: Canny on original grayscale ──
	const cannyPasses: [number, number][] = [
		[25, 75], [40, 100], [15, 50], [50, 140],
	];
	for (const [lo, hi] of cannyPasses) {
		const edges = cannyEdges(blurred, w, h, lo, hi);
		const quad = detectQuadFromBinaryMap(edges, w, h, 3, gradientField, blurred);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy B: Canny on CLAHE-enhanced (key for low contrast) ──
	const clahePasses: [number, number][] = [
		[20, 60], [30, 80], [10, 40], [40, 120],
	];
	for (const [lo, hi] of clahePasses) {
		const edges = cannyEdges(enhancedBlurred, w, h, lo, hi);
		const quad = detectQuadFromBinaryMap(edges, w, h, 3, gradientField, blurred);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy C: Multi-channel color edges (catches color-only borders) ──
	const colorMag = colorEdgeMagnitude(blurredChannels, w, h);
	for (const thresh of [30, 50, 20, 70]) {
		const binary = thresholdMagnitude(colorMag, w, h, thresh);
		const quad = detectQuadFromBinaryMap(binary, w, h, 3, gradientField, blurred);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy D: Adaptive threshold (both original and enhanced) ──
	const adaptivePasses: [number, number][] = [
		[21, 7], [11, 5], [31, 10], [15, 3], [41, 12],
	];
	for (const [block, c] of adaptivePasses) {
		const thresh = adaptiveThreshold(blurred, w, h, block, c);
		const quad = detectQuadFromBinaryMap(thresh, w, h, 2, gradientField, blurred);
		if (quad) candidates.push(quad);
	}
	for (const [block, c] of [[21, 5], [11, 3], [31, 8]] as [number, number][]) {
		const thresh = adaptiveThreshold(enhancedBlurred, w, h, block, c);
		const quad = detectQuadFromBinaryMap(thresh, w, h, 2, gradientField, blurred);
		if (quad) candidates.push(quad);
	}

	// ── Strategy E: Full-frame fallback for close-up ──
	const borderQuad = detectFromFullFrame(gradientField, blurred, w, h);
	if (borderQuad) candidates.push(borderQuad);

	if (candidates.length === 0) return { quad: null, confidence: 0 };

	const best = candidates.reduce((a, b) => b.score > a.score ? b : a);

	// ── Final precision refinement on the winning quad ──
	// Use a tight corridor for sub-pixel accurate edge fitting
	const tightCorridor = Math.max(3, Math.min(w, h) * 0.015);
	const precisionSides: [Pt, Pt][] = [
		[best.corners[0], best.corners[1]],
		[best.corners[1], best.corners[2]],
		[best.corners[2], best.corners[3]],
		[best.corners[3], best.corners[0]],
	];
	const precisionLines = precisionSides.map(([a, b]) =>
		fitEdgeLine(a, b, gradientField, w, h, tightCorridor)
	);

	const precisionCorners: Pt[] = [];
	const precisionMaxShift = Math.max(5, Math.min(w, h) * 0.04);
	for (let i = 0; i < 4; i++) {
		const lineA = precisionLines[(i + 3) % 4];
		const lineB = precisionLines[i];
		if (lineA && lineB) {
			const pt = intersectLines(lineA, lineB);
			if (
				pt &&
				pt.x >= -5 && pt.x <= w + 5 &&
				pt.y >= -5 && pt.y <= h + 5 &&
				Math.hypot(pt.x - best.corners[i].x, pt.y - best.corners[i].y) <= precisionMaxShift
			) {
				precisionCorners.push(pt);
				continue;
			}
		}
		precisionCorners.push(best.corners[i]);
	}

	for (const p of precisionCorners) {
		p.x = Math.max(0, Math.min(w - 1, p.x));
		p.y = Math.max(0, Math.min(h - 1, p.y));
	}

	const finalCorners = orderQuadPoints(precisionCorners);
	const finalScore = scoreQuad(finalCorners, w, h, gradientField, blurred);
	const finalBest = finalScore >= best.score * 0.92
		? { corners: finalCorners, score: Math.max(finalScore, best.score) }
		: best;

	return makeResult(finalBest, w, h);
}

/**
 * Full-frame fallback for close-up detection.
 * Starts with a full-frame quad and uses gradient-based edge line fitting
 * to find paper edges near each frame border. For borders with no detected
 * edge, falls back to the frame border itself.
 */
function detectFromFullFrame(
	field: GradientField,
	gray: Uint8Array,
	w: number,
	h: number
): ScoredQuad | null {
	const margin = 2;
	const fullFrame: [Pt, Pt, Pt, Pt] = [
		{ x: margin, y: margin },
		{ x: w - margin - 1, y: margin },
		{ x: w - margin - 1, y: h - margin - 1 },
		{ x: margin, y: h - margin - 1 },
	];

	// Sides: top, right, bottom, left — perpendicular search goes inward
	const sides: [Pt, Pt][] = [
		[fullFrame[0], fullFrame[1]],
		[fullFrame[1], fullFrame[2]],
		[fullFrame[2], fullFrame[3]],
		[fullFrame[3], fullFrame[0]],
	];

	const corridor = Math.max(12, Math.min(w, h) * 0.18);
	const lines: (Line | null)[] = sides.map(([a, b]) =>
		fitEdgeLine(a, b, field, w, h, corridor)
	);

	const detectedCount = lines.filter(l => l !== null).length;
	if (detectedCount < 2) return null;

	// Frame border lines for undetected edges
	const frameBorderLines: Line[] = [
		{ a: 0, b: 1, c: -margin },
		{ a: 1, b: 0, c: -(w - margin - 1) },
		{ a: 0, b: 1, c: -(h - margin - 1) },
		{ a: 1, b: 0, c: -margin },
	];

	const finalLines = lines.map((l, i) => l ?? frameBorderLines[i]);

	// TL = left∩top, TR = top∩right, BR = right∩bottom, BL = bottom∩left
	const tl = intersectLines(finalLines[3], finalLines[0]);
	const tr = intersectLines(finalLines[0], finalLines[1]);
	const br = intersectLines(finalLines[1], finalLines[2]);
	const bl = intersectLines(finalLines[2], finalLines[3]);

	if (!tl || !tr || !br || !bl) return null;

	const clampPt = (p: Pt): Pt => ({
		x: Math.max(0, Math.min(w - 1, p.x)),
		y: Math.max(0, Math.min(h - 1, p.y)),
	});

	const corners = orderQuadPoints([clampPt(tl), clampPt(tr), clampPt(br), clampPt(bl)]);
	if (!isConvex(corners)) return null;

	const score = scoreQuad(corners, w, h, field, gray);
	if (score < MIN_SCORE * 0.8) return null;

	return { corners, score: score * 0.9 };
}

function makeResult(quad: ScoredQuad, w: number, h: number): DetectionResult {
	const expanded = expandQuadOutward(quad.corners, w, h);
	return {
		quad: {
			tl: { x: expanded[0].x / w, y: expanded[0].y / h },
			tr: { x: expanded[1].x / w, y: expanded[1].y / h },
			br: { x: expanded[2].x / w, y: expanded[2].y / h },
			bl: { x: expanded[3].x / w, y: expanded[3].y / h },
		},
		confidence: quad.score,
	};
}

/** Detect a rectangular document in a live video frame (real-time). */
export function detectDocument(video: HTMLVideoElement): DetectionResult {
	return detectAtResolution(video, DETECT_SIZE, true);
}

// ═══════════════════════════════════════════════════════════════════════
// HIGH-QUALITY DETECTION (for captured images)
// ═══════════════════════════════════════════════════════════════════════

/** Detect document in a static image blob at higher quality (all strategies, no early-exit). */
export async function detectDocumentFromBlob(blob: Blob): Promise<QuadCrop | null> {
	const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
	const result = detectAtResolution(bitmap, HQ_DETECT_SIZE, false);
	bitmap.close();
	return result.quad;
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPORAL STABILIZATION
// ═══════════════════════════════════════════════════════════════════════

const _history: QuadCrop[] = [];
let _noDetectCount = 0;

/** Reset stabilization (e.g. on camera switch) */
export function resetStabilization(): void {
	_history.length = 0;
	_noDetectCount = 0;
}

/** Stabilize a detected quad by averaging recent detections. */
export function stabilizeQuad(quad: QuadCrop | null): QuadCrop | null {
	if (!quad) {
		_noDetectCount++;
		if (_noDetectCount > 3 && _history.length > 0) _history.shift();
		return _history.length >= 2 ? averageQuads(_history) : null;
	}

	_noDetectCount = 0;

	// Large jump → reset (new document or noise)
	if (_history.length > 0) {
		const dist = quadDistance(_history[_history.length - 1], quad);
		if (dist > 0.15) _history.length = 0;
	}

	_history.push(quad);
	if (_history.length > STABILIZE_FRAMES) _history.shift();

	return averageQuads(_history);
}

function averageQuads(quads: QuadCrop[]): QuadCrop {
	const n = quads.length;
	const r = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } };
	for (const q of quads) {
		r.tl.x += q.tl.x; r.tl.y += q.tl.y;
		r.tr.x += q.tr.x; r.tr.y += q.tr.y;
		r.br.x += q.br.x; r.br.y += q.br.y;
		r.bl.x += q.bl.x; r.bl.y += q.bl.y;
	}
	r.tl.x /= n; r.tl.y /= n;
	r.tr.x /= n; r.tr.y /= n;
	r.br.x /= n; r.br.y /= n;
	r.bl.x /= n; r.bl.y /= n;
	return r;
}

function quadDistance(a: QuadCrop, b: QuadCrop): number {
	return (
		Math.hypot(a.tl.x - b.tl.x, a.tl.y - b.tl.y) +
		Math.hypot(a.tr.x - b.tr.x, a.tr.y - b.tr.y) +
		Math.hypot(a.br.x - b.br.x, a.br.y - b.br.y) +
		Math.hypot(a.bl.x - b.bl.x, a.bl.y - b.bl.y)
	) / 4;
}
