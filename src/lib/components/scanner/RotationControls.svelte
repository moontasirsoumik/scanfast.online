<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import RotateCounterclockwise from 'carbon-icons-svelte/lib/RotateCounterclockwise.svelte';
	import Rotate from 'carbon-icons-svelte/lib/Rotate.svelte';
	import ReflectHorizontal from 'carbon-icons-svelte/lib/ReflectHorizontal.svelte';

	interface Props {
		rotation: number;
		straighten: number;
		onrotate: (degrees: number) => void;
		onstraighten: (degrees: number) => void;
	}

	let { rotation, straighten, onrotate, onstraighten }: Props = $props();

	function rotateLeft() {
		onrotate(((rotation - 90) % 360 + 360) % 360);
	}

	function rotateRight() {
		onrotate((rotation + 90) % 360);
	}

	function flip() {
		onrotate((rotation + 180) % 360);
	}

	function handleStraightenInput(e: Event) {
		const input = e.target as HTMLInputElement;
		onstraighten(parseFloat(input.value));
	}

	function resetStraighten() {
		onstraighten(0);
	}
</script>

<div class="rotation-controls">
	<div class="rotation-buttons">
		<Button
			kind="ghost"
			size="small"
			icon={RotateCounterclockwise}
			iconDescription="Rotate left 90°"
			on:click={rotateLeft}
		/>
		<Button
			kind="ghost"
			size="small"
			icon={Rotate}
			iconDescription="Rotate right 90°"
			on:click={rotateRight}
		/>
		<Button
			kind="ghost"
			size="small"
			icon={ReflectHorizontal}
			iconDescription="Flip 180°"
			on:click={flip}
		/>

		{#if rotation !== 0}
			<span class="rotation-badge">{rotation}°</span>
		{/if}
	</div>

	<div class="straighten-row">
		<input
			type="range"
			class="straighten-slider"
			min="-15"
			max="15"
			step="0.5"
			value={straighten}
			oninput={handleStraightenInput}
			aria-label="Fine straighten angle"
		/>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="straighten-label"
			ondblclick={resetStraighten}
			title="Double-click to reset"
		>{straighten.toFixed(1)}°</span>
	</div>
</div>

<style>
	.rotation-controls {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
	}

	.rotation-buttons {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.rotation-badge {
		font-family: var(--sf-font-body);
		font-size: 0.75rem;
		color: var(--cds-text-on-color, #fff);
		background: var(--cds-interactive, #0f62fe);
		padding: 2px 8px;
		border-radius: 24px;
		line-height: 1.2;
		margin-left: 0.25rem;
	}

	.straighten-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}

	.straighten-slider {
		flex: 1;
		min-width: 0;
		height: 4px;
		appearance: none;
		-webkit-appearance: none;
		background: var(--cds-border-subtle-01, #262626);
		outline: none;
		border-radius: 0;
		cursor: pointer;
	}

	.straighten-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		background: var(--cds-interactive, #0f62fe);
		border: none;
		border-radius: 0;
		cursor: pointer;
	}

	.straighten-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		background: var(--cds-interactive, #0f62fe);
		border: none;
		border-radius: 0;
		cursor: pointer;
	}

	.straighten-label {
		font-family: var(--sf-font-body);
		font-size: 0.75rem;
		color: var(--cds-text-secondary, #c6c6c6);
		min-width: 3rem;
		text-align: right;
		cursor: pointer;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
</style>
