/** @module History store — undo/redo command pattern using Zustand. */
import { create } from 'zustand';

/** A command that can be undone */
export interface Command {
	/** What this command does */
	description: string;
	/** Execute the command */
	execute(): void;
	/** Undo the command */
	undo(): void;
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
