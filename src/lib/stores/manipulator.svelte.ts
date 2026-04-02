import type { PageData } from '$lib/services/pdf';

/** Max pages per session */
export const MAX_PAGES = 20;

/** Manipulator workspace state */
class ManipulatorState {
	pages = $state<PageData[]>([]);
	selectedIds = $state<Set<string>>(new Set());
	isLoading = $state(false);
	loadProgress = $state<[number, number]>([0, 0]);
}

export const workspace = new ManipulatorState();

// --- Convenience accessors ---
export function getPages(): PageData[] { return workspace.pages; }
export function getSelectedIds(): Set<string> { return workspace.selectedIds; }

/** Set loading state */
export function setLoading(value: boolean): void {
	workspace.isLoading = value;
}

/** Set load progress */
export function setLoadProgress(loaded: number, total: number): void {
	workspace.loadProgress = [loaded, total];
}

/** Set pages directly (used for undo/redo) */
export function setPages(newPages: PageData[]): void {
	workspace.pages = newPages;
}

/** Set selectedIds directly (used for undo/redo) */
export function setSelectedIds(ids: Set<string>): void {
	workspace.selectedIds = ids;
}

/** Add pages to workspace */
export function addPages(newPages: PageData[]): void {
	const remaining = MAX_PAGES - workspace.pages.length;
	workspace.pages = [...workspace.pages, ...newPages.slice(0, remaining)];
}

/** Remove pages by IDs */
export function removePages(ids: Set<string>): PageData[] {
	const removed = workspace.pages.filter((p) => ids.has(p.id));
	workspace.pages = workspace.pages.filter((p) => !ids.has(p.id));
	workspace.selectedIds = new Set();
	return removed;
}

/** Duplicate pages by IDs (insert copies after each original) */
export function duplicatePages(ids: Set<string>): void {
	const remaining = MAX_PAGES - workspace.pages.length;
	if (remaining <= 0) return;

	const newPages: PageData[] = [];
	let dupeCount = 0;

	for (const page of workspace.pages) {
		newPages.push(page);
		if (ids.has(page.id) && dupeCount < remaining) {
			newPages.push({
				...page,
				id: crypto.randomUUID()
			});
			dupeCount++;
		}
	}

	workspace.pages = newPages;
}

/** Rotate selected pages by given degrees */
export function rotatePages(ids: Set<string>, degreesVal: 90 | 180 | 270 = 90): void {
	workspace.pages = workspace.pages.map((p) => {
		if (!ids.has(p.id)) return p;
		return { ...p, rotation: (p.rotation + degreesVal) % 360 };
	});
}

/** Reorder pages */
export function reorderPages(newOrder: PageData[]): void {
	workspace.pages = newOrder;
}

/** Clear selection */
export function clearSelection(): void {
	workspace.selectedIds = new Set();
}

/** Toggle page selection */
export function toggleSelect(id: string, multi = false): void {
	if (multi) {
		const next = new Set(workspace.selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		workspace.selectedIds = next;
	} else {
		workspace.selectedIds = workspace.selectedIds.has(id) && workspace.selectedIds.size === 1 ? new Set() : new Set([id]);
	}
}

/** Select range (shift+click) */
export function selectRange(id: string): void {
	if (workspace.selectedIds.size === 0) {
		workspace.selectedIds = new Set([id]);
		return;
	}

	const lastSelected = [...workspace.selectedIds].pop()!;
	const lastIdx = workspace.pages.findIndex((p) => p.id === lastSelected);
	const currIdx = workspace.pages.findIndex((p) => p.id === id);

	if (lastIdx === -1 || currIdx === -1) return;

	const start = Math.min(lastIdx, currIdx);
	const end = Math.max(lastIdx, currIdx);
	const range = workspace.pages.slice(start, end + 1).map((p) => p.id);
	workspace.selectedIds = new Set([...workspace.selectedIds, ...range]);
}

/** Select all pages */
export function selectAll(): void {
	workspace.selectedIds = new Set(workspace.pages.map((p) => p.id));
}

/** Reset the entire workspace */
export function resetWorkspace(): void {
	workspace.pages = [];
	workspace.selectedIds = new Set();
	workspace.isLoading = false;
	workspace.loadProgress = [0, 0];
}
