<script lang="ts">
	import type { PageData } from '$lib/services/pdf';

	interface Props {
		page: PageData;
		index: number;
		selected: boolean;
		onclick: (e: MouseEvent) => void;
	}

	let { page, index, selected, onclick }: Props = $props();
</script>

<button
	class="thumb"
	class:selected
	onclick={onclick}
	title="{page.sourceFile} — Page {index + 1}"
	aria-label="Page {index + 1} — {page.sourceFile}"
	aria-pressed={selected}
>
	<div class="thumb-preview">
		<img
			src={page.thumbnail}
			alt="Page {index + 1}"
			style="transform: rotate({page.rotation}deg)"
			draggable="false"
		/>
	</div>
	<span class="thumb-number">{index + 1}</span>
	<span class="thumb-name">{page.sourceFile}</span>
</button>

<style>
	.thumb {
		all: unset;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px;
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-sm, 8px);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		position: relative;
	}

	.thumb:hover {
		background: var(--cds-layer-hover-01, #1a1a1a);
		border-color: var(--cds-border-subtle-02, #393939);
	}

	.thumb:focus-visible {
		outline: 2px solid var(--cds-focus, #0f62fe);
		outline-offset: 2px;
	}

	.thumb.selected {
		border: 2px solid var(--cds-interactive, #0f62fe);
		background: var(--cds-background-selected, rgba(141, 141, 141, 0.2));
	}

	.thumb-preview {
		width: 100%;
		aspect-ratio: 210 / 297;
		background: var(--cds-layer-02, #1a1a1a);
		border-radius: var(--sf-radius-sm, 8px);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.thumb-preview img {
		object-fit: contain;
		width: 100%;
		height: 100%;
	}

	.thumb-number {
		position: absolute;
		top: 12px;
		left: 12px;
		font-family: var(--sf-font-body);
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--cds-text-on-color, #fff);
		background: var(--cds-interactive, #0f62fe);
		border-radius: var(--sf-radius-pill, 100px);
		min-width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
		line-height: 1;
	}

	.thumb-name {
		font-family: var(--sf-font-body);
		font-size: 0.625rem;
		color: var(--cds-text-placeholder, #6f6f6f);
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		max-width: 100%;
	}
</style>
