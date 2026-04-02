<script lang="ts">
	import type { FilterType } from '$lib/stores/scanner.svelte';
	import { applyFilter } from '$lib/services/filters';

	interface Props {
		sourceBlob: Blob;
		activeFilter: FilterType;
		onselect: (filter: FilterType) => void;
	}

	let { sourceBlob, activeFilter, onselect }: Props = $props();

	const FILTERS: { type: FilterType; label: string }[] = [
		{ type: 'original', label: 'Original' },
		{ type: 'enhance', label: 'Enhance' },
		{ type: 'bw', label: 'B&W' },
		{ type: 'grayscale', label: 'Gray' },
		{ type: 'sharpen', label: 'Sharpen' }
	];

	let previews = $state<Map<FilterType, string>>(new Map());
	let loading = $state(true);

	/** Resize blob to a small version for preview generation */
	async function createSmallBlob(blob: Blob): Promise<Blob> {
		const img = await createImageBitmap(blob);
		const maxSize = 64;
		const scale = maxSize / Math.max(img.width, img.height);
		const w = Math.round(img.width * scale);
		const h = Math.round(img.height * scale);

		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to get 2d context');
		ctx.drawImage(img, 0, 0, w, h);
		return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
	}

	async function generatePreviews(blob: Blob) {
		loading = true;
		try {
			const smallBlob = await createSmallBlob(blob);
			const results = await Promise.all(
				FILTERS.map(async (f) => {
					const dataUrl = await applyFilter(smallBlob, f.type);
					return [f.type, dataUrl] as const;
				})
			);
			const map = new Map<FilterType, string>();
			for (const [type, url] of results) {
				map.set(type, url);
			}
			previews = map;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (sourceBlob) {
			generatePreviews(sourceBlob);
		}
	});
</script>

<div class="filter-bar" role="radiogroup" aria-label="Image filters">
	{#each FILTERS as f}
		<button
			class="filter-card"
			class:active={activeFilter === f.type}
			onclick={() => onselect(f.type)}
			role="radio"
			aria-checked={activeFilter === f.type}
			aria-label={f.label}
		>
			<div class="preview-box">
				{#if loading || !previews.has(f.type)}
					<div class="skeleton"></div>
				{:else}
					<img src={previews.get(f.type)} alt={f.label} class="preview-img" />
				{/if}
			</div>
			<span class="filter-label">{f.label}</span>
		</button>
	{/each}
</div>

<style>
	.filter-bar {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		overflow-x: auto;
		overflow-y: hidden;
		height: 80px;
		align-items: center;
		background: var(--cds-layer-01, #0d0d0d);
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.filter-bar::-webkit-scrollbar {
		display: none;
	}

	.filter-card {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 4px;
		border: 2px solid transparent;
		border-radius: var(--sf-radius-sm, 8px);
		background: none;
		cursor: pointer;
		color: var(--cds-text-secondary, #c6c6c6);
		-webkit-tap-highlight-color: transparent;
	}

	.filter-card.active {
		border-color: var(--cds-interactive, #0f62fe);
		color: var(--cds-text-primary, #f4f4f4);
	}

	.preview-box {
		width: 48px;
		height: 48px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--cds-layer-02, #1a1a1a);
	}

	.preview-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.skeleton {
		width: 100%;
		height: 100%;
		background: var(--cds-skeleton-element, #393939);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.filter-label {
		font-family: var(--sf-font-body);
		font-size: 0.625rem;
		line-height: 1;
		white-space: nowrap;
	}
</style>
