import type { Timeline } from "@arcumark/shared";

export interface HistoryState {
	timeline: Timeline;
	timestamp: number;
	description?: string;
}

export class HistoryStack {
	private undoStack: HistoryState[] = [];
	private redoStack: HistoryState[] = [];
	private maxSize: number;

	constructor(maxSize: number = 50) {
		this.maxSize = maxSize;
	}

	push(state: HistoryState): void {
		this.undoStack.push(state);
		if (this.undoStack.length > this.maxSize) {
			this.undoStack.shift();
		}
		// Clear redo stack when new action is performed
		this.redoStack = [];
	}

	undo(): HistoryState | null {
		if (this.undoStack.length === 0) return null;
		const state = this.undoStack.pop()!;
		this.redoStack.push(state);
		return this.undoStack[this.undoStack.length - 1] || null;
	}

	redo(): HistoryState | null {
		if (this.redoStack.length === 0) return null;
		const state = this.redoStack.pop()!;
		this.undoStack.push(state);
		return state;
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}

	getUndoCount(): number {
		return this.undoStack.length;
	}

	getRedoCount(): number {
		return this.redoStack.length;
	}
}
