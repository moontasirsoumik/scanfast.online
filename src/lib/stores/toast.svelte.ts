/** @module Toast store — in-memory notification state. */

/** Toast message displayed to the user */
export interface ToastMessage {
	id: string;
	kind: 'info' | 'success' | 'warning' | 'error';
	title: string;
	subtitle?: string;
	duration?: number;
}

const MAX_VISIBLE = 5;

/** Toast notification state */
class ToastState {
	messages = $state<ToastMessage[]>([]);
}

/** Singleton toast state instance */
export const toasts = new ToastState();

/** Add a toast notification. Auto-generates an ID. */
export function addToast(message: Omit<ToastMessage, 'id'>): void {
	const id = crypto.randomUUID();
	const toast: ToastMessage = { id, duration: 4000, ...message };
	toasts.messages = [...toasts.messages, toast];

	// Trim to max visible, removing oldest
	if (toasts.messages.length > MAX_VISIBLE) {
		toasts.messages = toasts.messages.slice(-MAX_VISIBLE);
	}
}

/** Remove a toast by ID */
export function removeToast(id: string): void {
	toasts.messages = toasts.messages.filter((m) => m.id !== id);
}
