/** @module History store — undo/redo command pattern using Zustand. */
import { create } from 'zustand';
import { addToast } from '@/stores/toast';

/** A command that can be undone */
export interface Command {
	/** What this command does */
	description: string;
	/** Execute the command */
	execute(): void;
	/** Undo the command */
	undo(): void;
	/** Skip the default success toast when the caller shows a custom one */
	suppressSuccessToast?: boolean;
}

const MAX_HISTORY = 20;

interface HistoryStore {
	undoStack: Command[];
	redoStack: Command[];
	canUndo: boolean;
	canRedo: boolean;
	execute: (command: Command) => void;
	undo: () => void;
	redo: () => void;
	clearHistory: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
	undoStack: [],
	redoStack: [],
	canUndo: false,
	canRedo: false,

	execute: (command) => {
		command.execute();
		if (!command.suppressSuccessToast) {
			addToast({ kind: 'success', title: 'Action complete', subtitle: command.description });
		}
		set((state) => {
			const newStack = [...state.undoStack, command].slice(-MAX_HISTORY);
			return {
				undoStack: newStack,
				redoStack: [],
				canUndo: newStack.length > 0,
				canRedo: false
			};
		});
	},

	undo: () => {
		const { undoStack } = get();
		if (undoStack.length === 0) return;
		const command = undoStack[undoStack.length - 1];
		command.undo();
		addToast({ kind: 'info', title: 'Action undone', subtitle: command.description });
		set((state) => {
			const newUndo = state.undoStack.slice(0, -1);
			const newRedo = [...state.redoStack, command];
			return {
				undoStack: newUndo,
				redoStack: newRedo,
				canUndo: newUndo.length > 0,
				canRedo: newRedo.length > 0
			};
		});
	},

	redo: () => {
		const { redoStack } = get();
		if (redoStack.length === 0) return;
		const command = redoStack[redoStack.length - 1];
		command.execute();
		addToast({ kind: 'info', title: 'Action redone', subtitle: command.description });
		set((state) => {
			const newRedo = state.redoStack.slice(0, -1);
			const newUndo = [...state.undoStack, command].slice(-MAX_HISTORY);
			return {
				undoStack: newUndo,
				redoStack: newRedo,
				canUndo: newUndo.length > 0,
				canRedo: newRedo.length > 0
			};
		});
	},

	clearHistory: () =>
		set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false })
}));
