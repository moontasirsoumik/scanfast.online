/** @module Toast store — in-memory notification state using Zustand. */
import { create } from 'zustand';

/** Toast message displayed to the user */
export interface ToastMessage {
	id: string;
	kind: 'info' | 'success' | 'warning' | 'error';
	title: string;
	subtitle?: string;
	duration?: number;
}

const MAX_VISIBLE = 5;

interface ToastStore {
	messages: ToastMessage[];
	addToast: (message: Omit<ToastMessage, 'id'>) => void;
	removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
	messages: [],
	addToast: (message) => {
		const id = crypto.randomUUID();
		const toast: ToastMessage = { id, duration: 4000, ...message };
		set((state) => ({
			messages: [...state.messages, toast].slice(-MAX_VISIBLE)
		}));
	},
	removeToast: (id) =>
		set((state) => ({
			messages: state.messages.filter((m) => m.id !== id)
		}))
}));

/** Convenience function for adding toasts without hook */
export function addToast(message: Omit<ToastMessage, 'id'>): void {
	useToastStore.getState().addToast(message);
}

/** Convenience function for removing toasts without hook */
export function removeToast(id: string): void {
	useToastStore.getState().removeToast(id);
}
