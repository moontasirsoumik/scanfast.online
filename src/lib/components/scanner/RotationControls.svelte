<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import RotateCounterclockwise from 'carbon-icons-svelte/lib/RotateCounterclockwise.svelte';
	import Rotate from 'carbon-icons-svelte/lib/Rotate.svelte';
	import ReflectHorizontal from 'carbon-icons-svelte/lib/ReflectHorizontal.svelte';

	interface Props {
		rotation: number;
		onrotate: (degrees: number) => void;
	}

	let { rotation, onrotate }: Props = $props();

	function rotateLeft() {
		onrotate(((rotation - 90) % 360 + 360) % 360);
	}

	function rotateRight() {
		onrotate((rotation + 90) % 360);
	}

	function flip() {
		onrotate((rotation + 180) % 360);
	}
</script>

<div class="rotation-controls">
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

<style>
	.rotation-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
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
</style>
