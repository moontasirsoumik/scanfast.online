<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import SwitchLayer from 'carbon-icons-svelte/lib/SwitchLayer_2.svelte';
	import ImageIcon from 'carbon-icons-svelte/lib/Image.svelte';
	import { startCamera, stopCamera, captureFrame, checkCameraSupport, triggerHaptic } from '$lib/services/camera';
	import { scanner } from '$lib/stores/scanner.svelte';

	interface Props {
		onCapture: (blob: Blob) => void;
		onClose: () => void;
	}

	let { onCapture, onClose }: Props = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let stream = $state<MediaStream | null>(null);
	let errorMessage = $state<string | null>(null);
	let isCapturing = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function initCamera() {
		errorMessage = null;
		try {
			const supported = await checkCameraSupport();
			if (!supported) {
				errorMessage = 'Camera not available on this device. Use the gallery button to import images.';
				return;
			}
			const s = await startCamera(scanner.cameraFacing);
			stream = s;
			if (videoEl) {
				videoEl.srcObject = s;
			}
		} catch {
			errorMessage = 'Camera permission denied. Use the gallery button to import images.';
		}
	}

	function cleanupCamera() {
		if (stream) {
			stopCamera(stream);
			stream = null;
		}
		if (videoEl) {
			videoEl.srcObject = null;
		}
	}

	$effect(() => {
		initCamera();
		return () => cleanupCamera();
	});

	async function handleCapture() {
		if (!videoEl || isCapturing) return;
		isCapturing = true;
		try {
			const blob = await captureFrame(videoEl);
			triggerHaptic();
			onCapture(blob);
		} finally {
			isCapturing = false;
		}
	}

	async function handleSwitchCamera() {
		cleanupCamera();
		scanner.cameraFacing = scanner.cameraFacing === 'environment' ? 'user' : 'environment';
		await initCamera();
	}

	function handleGalleryClick() {
		fileInput?.click();
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			onCapture(file);
		}
		input.value = '';
	}
</script>

<div class="camera-view">
	{#if errorMessage}
		<div class="camera-error">
			<p>{errorMessage}</p>
			<Button kind="secondary" size="small" on:click={handleGalleryClick}>
				Import from Gallery
			</Button>
		</div>
	{:else}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			autoplay
			playsinline
			muted
			class="viewfinder"
			aria-label="Camera viewfinder"
		></video>
	{/if}

	<div class="controls-bar">
		<button
			class="control-btn"
			onclick={handleSwitchCamera}
			aria-label="Switch camera"
			disabled={!!errorMessage}
		>
			<SwitchLayer size={24} />
		</button>

		<button
			class="capture-btn"
			onclick={handleCapture}
			aria-label="Capture photo"
			disabled={!!errorMessage || isCapturing}
		>
			<span class="capture-circle"></span>
		</button>

		<button
			class="control-btn"
			onclick={handleGalleryClick}
			aria-label="Import from gallery"
		>
			<ImageIcon size={24} />
		</button>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		class="hidden-input"
		onchange={handleFileChange}
	/>
</div>

<style>
	.camera-view {
		position: relative;
		width: 100%;
		height: calc(100dvh - 48px);
		background: #000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.viewfinder {
		flex: 1;
		width: 100%;
		object-fit: cover;
	}

	.camera-error {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 1rem;
		color: var(--cds-text-secondary);
		text-align: center;
	}

	.controls-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding: 1rem 1.5rem 2rem;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
	}

	.control-btn {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.control-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.capture-btn {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: 3px solid #fff;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.capture-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.capture-circle {
		display: block;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: #fff;
		transition: transform 120ms ease;
	}

	.capture-btn:active:not(:disabled) .capture-circle {
		transform: scale(0.9);
	}

	.hidden-input {
		display: none;
	}
</style>
