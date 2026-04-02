<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import DocumentAddIcon from 'carbon-icons-svelte/lib/DocumentAdd.svelte';
	import RotateIcon from 'carbon-icons-svelte/lib/Rotate.svelte';
	import CopyIcon from 'carbon-icons-svelte/lib/Copy.svelte';
	import TrashCanIcon from 'carbon-icons-svelte/lib/TrashCan.svelte';
	import SplitScreenIcon from 'carbon-icons-svelte/lib/SplitScreen.svelte';
	import CompressIcon from 'carbon-icons-svelte/lib/Minimize.svelte';
	import UndoIcon from 'carbon-icons-svelte/lib/Undo.svelte';
	import RedoIcon from 'carbon-icons-svelte/lib/Redo.svelte';
	import DownloadIcon from 'carbon-icons-svelte/lib/Download.svelte';
	import CheckboxCheckedIcon from 'carbon-icons-svelte/lib/CheckboxChecked.svelte';

	interface Props {
		pageCount: number;
		selectedCount: number;
		canUndo: boolean;
		canRedo: boolean;
		isLoading: boolean;
		onadd: () => void;
		onrotate: () => void;
		onduplicate: () => void;
		ondelete: () => void;
		onsplit: () => void;
		oncompress: () => void;
		onundo: () => void;
		onredo: () => void;
		onexport: () => void;
		onselectall: () => void;
	}

	let {
		pageCount,
		selectedCount,
		canUndo,
		canRedo,
		isLoading,
		onadd,
		onrotate,
		onduplicate,
		ondelete,
		onsplit,
		oncompress,
		onundo,
		onredo,
		onexport,
		onselectall
	}: Props = $props();

	let noSelection = $derived(selectedCount === 0);
	let noPages = $derived(pageCount === 0);
</script>

<div class="toolbar" role="toolbar" aria-label="Page operations" aria-orientation="horizontal">
	<div class="toolbar-group">
		<Button
			kind="ghost"
			size="small"
			icon={DocumentAddIcon}
			iconDescription="Add files"
			disabled={isLoading}
			on:click={onadd}
		><span class="btn-label">Add</span></Button>
		<Button
			kind="ghost"
			size="small"
			icon={CheckboxCheckedIcon}
			iconDescription="Select all"
			disabled={noPages}
			on:click={onselectall}
		><span class="btn-label">Select All</span></Button>
	</div>
	<div class="toolbar-divider"></div>
	<div class="toolbar-group">
		<Button
			kind="ghost"
			size="small"
			icon={RotateIcon}
			iconDescription="Rotate"
			disabled={noSelection}
			on:click={onrotate}
		><span class="btn-label">Rotate</span></Button>
		<Button
			kind="ghost"
			size="small"
			icon={CopyIcon}
			iconDescription="Duplicate"
			disabled={noSelection}
			on:click={onduplicate}
		><span class="btn-label">Duplicate</span></Button>
		<Button
			kind="ghost"
			size="small"
			icon={TrashCanIcon}
			iconDescription="Delete"
			disabled={noSelection}
			on:click={ondelete}
		><span class="btn-label">Delete</span></Button>
	</div>
	<div class="toolbar-divider"></div>
	<div class="toolbar-group">
		<Button
			kind="ghost"
			size="small"
			icon={SplitScreenIcon}
			iconDescription="Split"
			disabled={noPages}
			on:click={onsplit}
		><span class="btn-label">Split</span></Button>
		<Button
			kind="ghost"
			size="small"
			icon={CompressIcon}
			iconDescription="Compress"
			disabled={noSelection}
			on:click={oncompress}
		><span class="btn-label">Compress</span></Button>
	</div>
	<div class="toolbar-spacer"></div>
	<div class="toolbar-group">
		<Button
			kind="ghost"
			size="small"
			icon={UndoIcon}
			iconDescription="Undo"
			disabled={!canUndo}
			on:click={onundo}
		/>
		<Button
			kind="ghost"
			size="small"
			icon={RedoIcon}
			iconDescription="Redo"
			disabled={!canRedo}
			on:click={onredo}
		/>
	</div>
	<div class="toolbar-group">
		<Button
			kind="primary"
			size="small"
			icon={DownloadIcon}
			disabled={noPages || isLoading}
			on:click={onexport}
		><span class="btn-label">Export</span></Button>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 0;
		border-top: 1px solid var(--cds-border-subtle-01, #262626);
		border-bottom: 1px solid var(--cds-border-subtle-01, #262626);
		flex-wrap: wrap;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.toolbar-divider {
		width: 1px;
		height: 24px;
		background: var(--cds-border-subtle-01, #262626);
		margin: 0 4px;
	}

	.toolbar-spacer {
		flex: 1;
	}

	@media (max-width: 671px) {
		.toolbar {
			gap: 2px;
		}

		.btn-label {
			display: none;
		}
	}
</style>
