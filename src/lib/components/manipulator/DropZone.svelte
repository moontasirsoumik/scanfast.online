<script lang="ts">
	import DocumentAddIcon from 'carbon-icons-svelte/lib/DocumentAdd.svelte';

	interface Props {
		maxPages: number;
		onfiles: (files: File[]) => void;
	}

	let { maxPages, onfiles }: Props = $props();

	let fileInput: HTMLInputElement | undefined = $state();
	let dragOver = $state(false);

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (!e.dataTransfer?.files) return;
		const files = Array.from(e.dataTransfer.files).filter(
			(f) => f.type === 'application/pdf' || f.type.startsWith('image/')
		);
		if (files.length > 0) onfiles(files);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		onfiles(Array.from(input.files));
		input.value = '';
	}

	function openPicker() {
		fileInput?.click();
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".pdf,.jpg,.jpeg,.png,.webp"
	multiple
	hidden
	onchange={handleFileInput}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="drop-zone"
	class:drag-over={dragOver}
	role="button"
	tabindex="0"
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	onclick={openPicker}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPicker(); }}
>
	<div class="drop-zone-content">
		<DocumentAddIcon size={48} />
		<p class="drop-label">Drop PDF or image files here, or click to browse</p>
		<span class="drop-hint">Supported: PDF, JPEG, PNG, WebP</span>
		<span class="drop-hint-small">Up to {maxPages} pages per session — all processing happens in your browser</span>
	</div>
</div>

<style>
	.drop-zone {
		margin-top: 16px;
		background: var(--cds-layer-01, #0d0d0d);
		border: 2px dashed var(--cds-border-subtle-02, #393939);
		border-radius: var(--sf-radius-md, 12px);
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.drop-zone:hover,
	.drop-zone:focus-visible,
	.drop-zone.drag-over {
		border-color: var(--cds-interactive, #0f62fe);
		outline: none;
	}

	.drop-zone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 32px 16px;
		color: var(--cds-icon-secondary, #c6c6c6);
	}

	.drop-label {
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0;
		text-align: center;
	}

	.drop-hint {
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	.drop-hint-small {
		font-family: var(--sf-font-body);
		font-size: 0.75rem;
		color: var(--cds-text-placeholder, #6f6f6f);
		text-align: center;
	}
</style>
