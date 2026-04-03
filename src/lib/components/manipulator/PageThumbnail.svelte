<script lang="ts">
	import type { PageData } from '$lib/services/pdf';

	interface Props {
		page: PageData;
		index: number;
		selected: boolean;
		onclick: (e: MouseEvent) => void;
		onlongpress?: () => void;
	}

	let { page, index, selected, onclick, onlongpress }: Props = $props();

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressFired = false;

	function handleTouchStart() {
		longPressFired = false;
		longPressTimer = setTimeout(() => {
			longPressFired = true;
			navigator.vibrate?.(50);
			onlongpress?.();
		}, 500);
	}

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleClick(e: MouseEvent) {
		if (longPressFired) {
			longPressFired = false;
			return;
		}
		onclick(e);
	}

	/** Truncate filename for badge display */
	function truncName(name: string, max = 12): string {
		if (name.length <= max) return name;
		const ext = name.lastIndexOf('.');
		if (ext > 0 && name.length - ext <= 5) {
			const stem = name.slice(0, ext);
			const suffix = name.slice(ext);
			return stem.slice(0, max - suffix.length - 1) + '…' + suffix;
		}
		return name.slice(0, max - 1) + '…';
	}

	let showSourceBadge = $derived(page.sourceFile !== 'blank');
	let badgeLabel = $derived(truncName(page.sourceFile));
</script>

<button
	class="thumb"
	class:selected
	onclick={handleClick}
	ontouchstart={handleTouchStart}
	ontouchend={clearLongPress}
	ontouchmove={clearLongPress}
	ontouchcancel={clearLongPress}
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
	{#if showSourceBadge}
		<span class="source-badge" title={page.sourceFile}>{badgeLabel}</span>
	{/if}
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

	.source-badge {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--sf-font-body);
		font-size: 0.5625rem;
		color: var(--cds-text-secondary, #c6c6c6);
		background: var(--cds-layer-02, #1a1a1a);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		padding: 1px 6px;
		border-radius: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: calc(100% - 16px);
		line-height: 1.4;
		pointer-events: none;
	}
</style>
