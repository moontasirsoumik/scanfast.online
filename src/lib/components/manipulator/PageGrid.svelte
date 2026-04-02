<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import type { PageData } from '$lib/services/pdf';
	import PageThumbnail from './PageThumbnail.svelte';

	interface Props {
		pages: PageData[];
		selectedIds: Set<string>;
		onselect: (id: string, e: MouseEvent) => void;
		onreorder: (newPages: PageData[]) => void;
	}

	let { pages, selectedIds, onselect, onreorder }: Props = $props();

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<{ items: PageData[] }>) {
		pages = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: PageData[] }>) {
		onreorder(e.detail.items);
	}
</script>

<div
	class="page-grid"
	role="grid"
	aria-label="Page grid — drag to reorder"
	use:dndzone={{ items: pages, flipDurationMs, type: 'pages' }}
	onconsider={handleDndConsider}
	onfinalize={handleDndFinalize}
>
	{#each pages as page, i (page.id)}
		<PageThumbnail
			{page}
			index={i}
			selected={selectedIds.has(page.id)}
			onclick={(e) => onselect(page.id, e)}
		/>
	{/each}
</div>

<style>
	.page-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 12px;
		margin-top: 16px;
		padding-bottom: 32px;
		min-height: 120px;
	}

	@media (max-width: 671px) {
		.page-grid {
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 8px;
		}
	}
</style>
