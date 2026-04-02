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

class HistoryState {
	undoStack = $state<Command[]>([]);
	redoStack = $state<Command[]>([]);
	canUndo = $derived(this.undoStack.length > 0);
	canRedo = $derived(this.redoStack.length > 0);
}

export const state = new HistoryState();

/** Whether undo is available */
export function getCanUndo(): boolean { return state.canUndo; }
/** Whether redo is available */
export function getCanRedo(): boolean { return state.canRedo; }

/** Execute a command and push to undo stack */
export function execute(command: Command): void {
	command.execute();
	state.undoStack = [...state.undoStack, command].slice(-MAX_HISTORY);
	state.redoStack = [];
}

/** Undo the last command */
export function undo(): void {
	if (state.undoStack.length === 0) return;
	const command = state.undoStack[state.undoStack.length - 1];
	state.undoStack = state.undoStack.slice(0, -1);
	command.undo();
	state.redoStack = [...state.redoStack, command];
}

/** Redo the last undone command */
export function redo(): void {
	if (state.redoStack.length === 0) return;
	const command = state.redoStack[state.redoStack.length - 1];
	state.redoStack = state.redoStack.slice(0, -1);
	command.execute();
	state.undoStack = [...state.undoStack, command].slice(-MAX_HISTORY);
}

/** Clear all history */
export function clearHistory(): void {
	state.undoStack = [];
	state.redoStack = [];
}
