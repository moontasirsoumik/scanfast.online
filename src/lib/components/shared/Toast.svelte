<script lang="ts">
	import { toasts, removeToast, type ToastMessage } from '$lib/stores/toast.svelte';
	import Close from 'carbon-icons-svelte/lib/Close.svelte';

	// Auto-dismiss toasts with duration > 0
	$effect(() => {
		const timers: ReturnType<typeof setTimeout>[] = [];
		for (const msg of toasts.messages) {
			if (msg.duration && msg.duration > 0) {
				const id = msg.id;
				timers.push(setTimeout(() => removeToast(id), msg.duration));
			}
		}
		return () => timers.forEach(clearTimeout);
	});

	const borderColors: Record<ToastMessage['kind'], string> = {
		info: 'var(--cds-support-info, #4589ff)',
		success: 'var(--cds-support-success, #42be65)',
		warning: 'var(--cds-support-warning, #f1c21b)',
		error: 'var(--cds-support-error, #ff8389)',
	};
</script>

{#if toasts.messages.length > 0}
	<div class="toast-container" role="log" aria-live="polite">
		{#each toasts.messages as msg (msg.id)}
			<div
				class="toast"
				style="border-left-color: {borderColors[msg.kind]}"
			>
				<div class="toast-content">
					<span class="toast-title">{msg.title}</span>
					{#if msg.subtitle}
						<span class="toast-subtitle">{msg.subtitle}</span>
					{/if}
				</div>
				<button
					class="toast-close"
					aria-label="Close notification"
					onclick={() => removeToast(msg.id)}
				>
					<Close size={16} />
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		z-index: 9000;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 24rem;
		pointer-events: none;
	}

	@media (max-width: 671px) {
		.toast-container {
			left: 1rem;
			right: 1rem;
			max-width: none;
		}
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--cds-layer-02, #1a1a1a);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-left: 3px solid;
		animation: toast-slide-up 200ms ease-out;
	}

	@keyframes toast-slide-up {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.toast-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.toast-subtitle {
		font-size: 0.8125rem;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	.toast-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--cds-text-secondary, #c6c6c6);
		cursor: pointer;
		padding: 0.125rem;
	}

	.toast-close:hover {
		color: var(--cds-text-primary, #f4f4f4);
	}
</style>
