<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import Download from 'carbon-icons-svelte/lib/Download.svelte';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import type { ScannedPage } from '$lib/stores/scanner.svelte';

	interface Props {
		pages: ScannedPage[];
		maxPages: number;
		onedit: (id: string) => void;
		ondelete: (id: string) => void;
		onexport: () => void;
		onmanipulator: () => void;
	}

	let { pages, maxPages, onedit, ondelete, onexport, onmanipulator }: Props = $props();
</script>

<div class="page-gallery">
	{#if pages.length === 0}
		<div class="empty-state">
			<p>No pages scanned yet. Capture your first page to get started.</p>
		</div>
	{:else}
		<div class="counter">
			{pages.length} / {maxPages} pages
		</div>

		<div class="thumbnail-strip" role="list">
			{#each pages as page, i (page.id)}
				<div
					class="thumb-card"
					role="button"
					tabindex="0"
					onclick={() => onedit(page.id)}
					onkeydown={(e) => { if (e.key === 'Enter') onedit(page.id); }}
					aria-label="Page {i + 1} — tap to edit"
				>
					<img src={page.thumbnail} alt="Page {i + 1}" class="thumb-img" />
					<span class="page-badge">{i + 1}</span>
					<button
						class="delete-btn"
						onclick={(e) => { e.stopPropagation(); ondelete(page.id); }}
						aria-label="Delete page {i + 1}"
					>
						<Close size={14} />
					</button>
				</div>
			{/each}
		</div>

		<div class="actions">
			<Button kind="primary" size="small" icon={Download} on:click={onexport}>
				Export as PDF
			</Button>
			<Button kind="secondary" size="small" icon={ArrowRight} on:click={onmanipulator}>
				Open in Manipulator
			</Button>
		</div>
	{/if}
</div>

<style>
	.page-gallery {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--cds-layer-01, #0d0d0d);
	}

	.empty-state {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--cds-text-secondary, #c6c6c6);
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
	}

	.counter {
		font-family: var(--sf-font-body);
		font-size: 0.75rem;
		color: var(--cds-text-secondary, #c6c6c6);
		padding: 0 0.25rem;
	}

	.thumbnail-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.25rem 0;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.thumbnail-strip::-webkit-scrollbar {
		display: none;
	}

	.thumb-card {
		flex-shrink: 0;
		width: 80px;
		height: 100px;
		position: relative;
		border: 2px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-sm, 8px);
		overflow: hidden;
		background: var(--cds-layer-02, #1a1a1a);
		cursor: pointer;
		scroll-snap-align: start;
		padding: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.thumb-card:hover {
		border-color: var(--cds-interactive, #0f62fe);
	}

	.thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.page-badge {
		position: absolute;
		bottom: 4px;
		left: 4px;
		font-family: var(--sf-font-body);
		font-size: 0.625rem;
		color: var(--cds-text-on-color, #fff);
		background: rgba(0, 0, 0, 0.7);
		padding: 1px 5px;
		border-radius: 24px;
		line-height: 1.3;
	}

	.delete-btn {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.7);
		color: var(--cds-text-primary, #f4f4f4);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}

	.delete-btn:hover {
		background: var(--cds-button-danger-primary, #da1e28);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.25rem 0;
	}
</style>
