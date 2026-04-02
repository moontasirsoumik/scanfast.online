<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import type { CropRect } from '$lib/stores/scanner.svelte';

	interface Props {
		imageUrl: string;
		initialCrop: CropRect | null;
		onchange: (crop: CropRect) => void;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { imageUrl, initialCrop, onchange, onconfirm, oncancel }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let imgEl = $state<HTMLImageElement | null>(null);
	let imgLoaded = $state(false);

	/** Displayed image bounds within the container */
	let imgRect = $state({ x: 0, y: 0, w: 0, h: 0 });

	/** Normalized crop (0–1) */
	let crop = $state<CropRect>({ x: 0, y: 0, width: 1, height: 1 });

	$effect(() => {
		if (initialCrop) {
			crop = { ...initialCrop };
		}
	});

	/** Active drag state */
	let dragHandle = $state<string | null>(null);
	let dragStart = $state({ px: 0, py: 0, crop: { x: 0, y: 0, width: 0, height: 0 } });

	const HANDLE_SIZE = 24;
	const MIN_CROP = 0.05;

	function updateImgRect() {
		if (!containerEl || !imgEl || !imgLoaded) return;
		const cw = containerEl.clientWidth;
		const ch = containerEl.clientHeight;
		const iw = imgEl.naturalWidth;
		const ih = imgEl.naturalHeight;
		if (!iw || !ih) return;

		const scale = Math.min(cw / iw, ch / ih);
		const w = iw * scale;
		const h = ih * scale;
		imgRect = { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
		drawOverlay();
	}

	$effect(() => {
		if (imgLoaded && containerEl) {
			updateImgRect();
			const ro = new ResizeObserver(() => updateImgRect());
			ro.observe(containerEl);
			return () => ro.disconnect();
		}
	});

	$effect(() => {
		// Redraw whenever crop changes
		void crop.x;
		void crop.y;
		void crop.width;
		void crop.height;
		drawOverlay();
	});

	function drawOverlay() {
		if (!canvasEl || !containerEl) return;
		const cw = containerEl.clientWidth;
		const ch = containerEl.clientHeight;
		canvasEl.width = cw;
		canvasEl.height = ch;

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, cw, ch);

		// Crop rect in pixel coords
		const cx = imgRect.x + crop.x * imgRect.w;
		const cy = imgRect.y + crop.y * imgRect.h;
		const cWidth = crop.width * imgRect.w;
		const cHeight = crop.height * imgRect.h;

		// Dim outside crop
		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
		ctx.fillRect(0, 0, cw, ch);
		ctx.clearRect(cx, cy, cWidth, cHeight);

		// Dashed crop border
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 4]);
		ctx.strokeRect(cx, cy, cWidth, cHeight);
		ctx.setLineDash([]);

		// Corner handles
		const corners = [
			{ hx: cx, hy: cy },
			{ hx: cx + cWidth, hy: cy },
			{ hx: cx, hy: cy + cHeight },
			{ hx: cx + cWidth, hy: cy + cHeight }
		];
		ctx.fillStyle = '#ffffff';
		for (const c of corners) {
			ctx.beginPath();
			ctx.arc(c.hx, c.hy, 6, 0, Math.PI * 2);
			ctx.fill();
		}

		// Edge handles (midpoints, small squares)
		const edges = [
			{ hx: cx + cWidth / 2, hy: cy },
			{ hx: cx + cWidth / 2, hy: cy + cHeight },
			{ hx: cx, hy: cy + cHeight / 2 },
			{ hx: cx + cWidth, hy: cy + cHeight / 2 }
		];
		for (const e of edges) {
			ctx.fillRect(e.hx - 4, e.hy - 4, 8, 8);
		}
	}

	function getHandleAt(px: number, py: number): string | null {
		const cx = imgRect.x + crop.x * imgRect.w;
		const cy = imgRect.y + crop.y * imgRect.h;
		const cw = crop.width * imgRect.w;
		const ch = crop.height * imgRect.h;
		const hs = HANDLE_SIZE / 2;

		// Corners
		if (Math.abs(px - cx) < hs && Math.abs(py - cy) < hs) return 'tl';
		if (Math.abs(px - (cx + cw)) < hs && Math.abs(py - cy) < hs) return 'tr';
		if (Math.abs(px - cx) < hs && Math.abs(py - (cy + ch)) < hs) return 'bl';
		if (Math.abs(px - (cx + cw)) < hs && Math.abs(py - (cy + ch)) < hs) return 'br';

		// Edges
		if (Math.abs(px - (cx + cw / 2)) < hs && Math.abs(py - cy) < hs) return 'top';
		if (Math.abs(px - (cx + cw / 2)) < hs && Math.abs(py - (cy + ch)) < hs) return 'bottom';
		if (Math.abs(px - cx) < hs && Math.abs(py - (cy + ch / 2)) < hs) return 'left';
		if (Math.abs(px - (cx + cw)) < hs && Math.abs(py - (cy + ch / 2)) < hs) return 'right';

		// Move (inside crop)
		if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch) return 'move';

		return null;
	}

	function pointerCoords(e: PointerEvent): { px: number; py: number } {
		if (!containerEl) return { px: 0, py: 0 };
		const rect = containerEl.getBoundingClientRect();
		return { px: e.clientX - rect.left, py: e.clientY - rect.top };
	}

	function handlePointerDown(e: PointerEvent) {
		const { px, py } = pointerCoords(e);
		const handle = getHandleAt(px, py);
		if (!handle) return;
		dragHandle = handle;
		dragStart = { px, py, crop: { ...crop } };
		(e.target as Element)?.setPointerCapture?.(e.pointerId);
		e.preventDefault();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragHandle) return;
		e.preventDefault();
		const { px, py } = pointerCoords(e);
		const dx = (px - dragStart.px) / imgRect.w;
		const dy = (py - dragStart.py) / imgRect.h;
		const s = dragStart.crop;

		let nx = crop.x;
		let ny = crop.y;
		let nw = crop.width;
		let nh = crop.height;

		if (dragHandle === 'move') {
			nx = clamp(s.x + dx, 0, 1 - s.width);
			ny = clamp(s.y + dy, 0, 1 - s.height);
			nw = s.width;
			nh = s.height;
		} else {
			const isLeft = dragHandle === 'tl' || dragHandle === 'bl' || dragHandle === 'left';
			const isRight = dragHandle === 'tr' || dragHandle === 'br' || dragHandle === 'right';
			const isTop = dragHandle === 'tl' || dragHandle === 'tr' || dragHandle === 'top';
			const isBottom = dragHandle === 'bl' || dragHandle === 'br' || dragHandle === 'bottom';

			if (isLeft) {
				const maxDx = s.width - MIN_CROP;
				const d = clamp(dx, -s.x, maxDx);
				nx = s.x + d;
				nw = s.width - d;
			} else if (isRight) {
				nw = clamp(s.width + dx, MIN_CROP, 1 - s.x);
			} else {
				nx = s.x;
				nw = s.width;
			}

			if (isTop) {
				const maxDy = s.height - MIN_CROP;
				const d = clamp(dy, -s.y, maxDy);
				ny = s.y + d;
				nh = s.height - d;
			} else if (isBottom) {
				nh = clamp(s.height + dy, MIN_CROP, 1 - s.y);
			} else {
				ny = s.y;
				nh = s.height;
			}
		}

		crop = { x: nx, y: ny, width: nw, height: nh };
		onchange(crop);
	}

	function handlePointerUp() {
		dragHandle = null;
	}

	function clamp(v: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, v));
	}
</script>

<div class="crop-editor">
	<div
		class="canvas-container"
		bind:this={containerEl}
	>
		<img
			src={imageUrl}
			alt="Crop target"
			class="crop-image"
			bind:this={imgEl}
			onload={() => { imgLoaded = true; updateImgRect(); }}
		/>
		<canvas
			bind:this={canvasEl}
			class="overlay-canvas"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
		></canvas>
	</div>

	<div class="crop-actions">
		<Button kind="secondary" size="small" on:click={oncancel}>Cancel</Button>
		<Button kind="primary" size="small" on:click={onconfirm}>Confirm</Button>
	</div>
</div>

<style>
	.crop-editor {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #000;
	}

	.canvas-container {
		flex: 1;
		position: relative;
		overflow: hidden;
		touch-action: none;
	}

	.crop-image {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		pointer-events: none;
		user-select: none;
	}

	.overlay-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}

	.crop-actions {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--cds-layer-01, #0d0d0d);
	}
</style>
