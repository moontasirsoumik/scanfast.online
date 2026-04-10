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
const DETECT_SIZE = 400;
/** Higher resolution for static image (capture-time) detection */
const HQ_DETECT_SIZE = 800;
/** Minimum quad area as fraction of frame */
const MIN_AREA_RATIO = 0.04;
/** Maximum quad area as fraction of frame */
const MAX_AREA_RATIO = 0.96;
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
 * Tries progressive DP simplification, then falls back to sharpest-corner selection.
 */
function fitToQuad(hull: Pt[]): [Pt, Pt, Pt, Pt] | null {
	if (hull.length < 4) return null;
	if (hull.length === 4) return orderQuadPoints(hull);

	const perim = polygonPerimeter(hull);

	for (const factor of [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10]) {
		const simplified = simplifyClosedPolygon(hull, perim * factor);
		if (simplified.length === 4) return orderQuadPoints(simplified);
		if (simplified.length < 4) break;
	}

	// Fallback: pick 4 sharpest corners from the hull
	return findSharpestFourCorners(hull);
}

function findSharpestFourCorners(poly: Pt[]): [Pt, Pt, Pt, Pt] | null {
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
		const top4 = ranked.slice(0, 4).map(r => poly[r.i]);
		return orderQuadPoints(top4);
	}

	return orderQuadPoints(picks.map(i => poly[i]));
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
	const sorted = pts.slice().sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
	const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
	const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
	return [top[0], top[1], bottom[1], bottom[0]];
}

// ═══════════════════════════════════════════════════════════════════════
// QUAD SCORING
// ═══════════════════════════════════════════════════════════════════════

function scoreQuad(corners: [Pt, Pt, Pt, Pt], frameW: number, frameH: number): number {
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
	const convexBonus = isConvex(corners) ? 1 : 0.4;

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

	return angleScore * 0.35 + areaScore * 0.25 + convexBonus * 0.2 + aspectScore * 0.2;
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION PIPELINE (single pass)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// GRADIENT-BASED CORNER REFINEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute Sobel gradient magnitude at each pixel.
 * Reusable across refinement calls for the same frame.
 */
function sobelMagnitude(gray: Uint8Array, w: number, h: number): Float32Array {
	const mag = new Float32Array(w * h);
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const gx =
				-gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x + 1]
				- 2 * gray[y * w + x - 1] + 2 * gray[y * w + x + 1]
				- gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x + 1];
			const gy =
				-gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1]
				+ gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
			mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
		}
	}
	return mag;
}

/**
 * Sample points along a line segment, perpendicular-search for the
 * strongest gradient within a corridor, and fit a least-squares line
 * through those edge points.
 */
function fitEdgeLine(
	p1: Pt, p2: Pt,
	gradMag: Float32Array,
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

	const NUM_SAMPLES = Math.min(40, Math.max(10, Math.round(len)));
	const edgePts: Pt[] = [];

	for (let s = 0; s < NUM_SAMPLES; s++) {
		const t = (s + 0.5) / NUM_SAMPLES;
		const cx = p1.x + dx * t;
		const cy = p1.y + dy * t;

		// Search along perpendicular for peak gradient
		let bestMag = 0;
		let bestX = cx, bestY = cy;

		for (let d = -corridor; d <= corridor; d += 0.5) {
			const sx = cx + nx * d;
			const sy = cy + ny * d;
			const ix = Math.round(sx);
			const iy = Math.round(sy);
			if (ix < 1 || ix >= w - 1 || iy < 1 || iy >= h - 1) continue;
			const mag = gradMag[iy * w + ix];
			if (mag > bestMag) {
				bestMag = mag;
				bestX = sx;
				bestY = sy;
			}
		}

		if (bestMag > 10) { // minimum gradient threshold (low for faint edges)
			edgePts.push({ x: bestX, y: bestY });
		}
	}

	if (edgePts.length < 3) return null;

	// RANSAC-lite: least-squares line fit with outlier rejection
	return ransacLineFit(edgePts);
}

/**
 * Simple RANSAC line fit: try random pairs, pick line with most inliers,
 * then refit on inliers only.
 */
function ransacLineFit(pts: Pt[]): Line | null {
	const n = pts.length;
	if (n < 3) return null;

	const INLIER_THRESHOLD = 3; // pixels
	const ITERS = Math.min(50, n * (n - 1) / 2);
	let bestInliers: Pt[] = [];

	for (let iter = 0; iter < ITERS; iter++) {
		// Pick two random points
		const i = Math.floor(Math.random() * n);
		let j = Math.floor(Math.random() * (n - 1));
		if (j >= i) j++;

		const line = lineFromTwoPoints(pts[i], pts[j]);
		if (!line) continue;

		const inliers = pts.filter(p => distToLine(p, line) <= INLIER_THRESHOLD);
		if (inliers.length > bestInliers.length) {
			bestInliers = inliers;
		}
	}

	if (bestInliers.length < 3) return leastSquaresLine(pts);
	return leastSquaresLine(bestInliers);
}

function lineFromTwoPoints(a: Pt, b: Pt): Line | null {
	const dx = b.x - a.x, dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return null;
	return { a: -dy / len, b: dx / len, c: (dy * a.x - dx * a.y) / len };
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
	gradMag: Float32Array,
	w: number, h: number
): [Pt, Pt, Pt, Pt] {
	// Sides: tl→tr, tr→br, br→bl, bl→tl
	const sides: [Pt, Pt][] = [
		[quad[0], quad[1]], // top
		[quad[1], quad[2]], // right
		[quad[2], quad[3]], // bottom
		[quad[3], quad[0]], // left
	];

	const corridor = Math.max(6, Math.min(w, h) * 0.04);
	const lines: (Line | null)[] = sides.map(([a, b]) =>
		fitEdgeLine(a, b, gradMag, w, h, corridor)
	);

	// If all 4 lines fitted, intersect them for precise corners
	const refined: Pt[] = [];
	for (let i = 0; i < 4; i++) {
		const lineA = lines[(i + 3) % 4]; // side ending at this corner
		const lineB = lines[i];            // side starting at this corner
		if (lineA && lineB) {
			const pt = intersectLines(lineA, lineB);
			if (pt && pt.x >= -10 && pt.x <= w + 10 && pt.y >= -10 && pt.y <= h + 10) {
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

	return refined as [Pt, Pt, Pt, Pt];
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
	gradMag: Float32Array | null
): ScoredQuad | null {
	const dilated = dilate(binary, w, h, dilateIter);

	// Clear a 2px margin so flood fill can always start from the border
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2)
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
	if (interiorCount > totalPixels * 0.95) return null; // fill leaked

	const boundary = findLargestInteriorBlob(outside, w, h);
	if (boundary.length < 8) return null;

	const hull = convexHull(boundary);
	if (hull.length < 4) return null;

	let quad = fitToQuad(hull);
	if (!quad) return null;

	// Refine corners using gradient edge fitting
	if (gradMag) {
		quad = refineQuadCorners(quad, gradMag, w, h);
	}

	const score = scoreQuad(quad, w, h);
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

	// Pre-compute gradient magnitude for corner refinement (use CLAHE-enhanced)
	const gradMag = sobelMagnitude(enhancedBlurred, w, h);

	const HIGH_CONFIDENCE = 0.6;
	const candidates: ScoredQuad[] = [];

	const maybeReturn = (): DetectionResult | null => {
		if (!realtime || candidates.length === 0) return null;
		const best = candidates.reduce((a, b) => b.score > a.score ? b : a);
		if (best.score >= HIGH_CONFIDENCE) return makeResult(best, w, h);
		return null;
	};

	// ── Strategy A: Canny on original grayscale ──
	const cannyPasses: [number, number][] = [
		[25, 75], [40, 100], [15, 50], [50, 140],
	];
	for (const [lo, hi] of cannyPasses) {
		const edges = cannyEdges(blurred, w, h, lo, hi);
		const quad = detectQuadFromBinaryMap(edges, w, h, 3, gradMag);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy B: Canny on CLAHE-enhanced (key for low contrast) ──
	const clahePasses: [number, number][] = [
		[20, 60], [30, 80], [10, 40], [40, 120],
	];
	for (const [lo, hi] of clahePasses) {
		const edges = cannyEdges(enhancedBlurred, w, h, lo, hi);
		const quad = detectQuadFromBinaryMap(edges, w, h, 3, gradMag);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy C: Multi-channel color edges (catches color-only borders) ──
	const colorMag = colorEdgeMagnitude(blurredChannels, w, h);
	for (const thresh of [30, 50, 20, 70]) {
		const binary = thresholdMagnitude(colorMag, w, h, thresh);
		const quad = detectQuadFromBinaryMap(binary, w, h, 3, gradMag);
		if (quad) candidates.push(quad);
	}
	{ const r = maybeReturn(); if (r) return r; }

	// ── Strategy D: Adaptive threshold (both original and enhanced) ──
	const adaptivePasses: [number, number][] = [
		[21, 7], [11, 5], [31, 10], [15, 3], [41, 12],
	];
	for (const [block, c] of adaptivePasses) {
		const thresh = adaptiveThreshold(blurred, w, h, block, c);
		const quad = detectQuadFromBinaryMap(thresh, w, h, 2, gradMag);
		if (quad) candidates.push(quad);
	}
	for (const [block, c] of [[21, 5], [11, 3], [31, 8]] as [number, number][]) {
		const thresh = adaptiveThreshold(enhancedBlurred, w, h, block, c);
		const quad = detectQuadFromBinaryMap(thresh, w, h, 2, gradMag);
		if (quad) candidates.push(quad);
	}

	if (candidates.length === 0) return { quad: null, confidence: 0 };

	const best = candidates.reduce((a, b) => b.score > a.score ? b : a);
	return makeResult(best, w, h);
}

function makeResult(quad: ScoredQuad, w: number, h: number): DetectionResult {
	return {
		quad: {
			tl: { x: quad.corners[0].x / w, y: quad.corners[0].y / h },
			tr: { x: quad.corners[1].x / w, y: quad.corners[1].y / h },
			br: { x: quad.corners[2].x / w, y: quad.corners[2].y / h },
			bl: { x: quad.corners[3].x / w, y: quad.corners[3].y / h },
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
