/** @module Manipulator store — in-memory PDF workspace state using Zustand. */
import { create } from 'zustand';
import type { PageData } from '@/services/pdf';

/** Max pages per session */
export const MAX_PAGES = 20;

interface ManipulatorStore {
	pages: PageData[];
	selectedIds: Set<string>;
	isLoading: boolean;
	loadProgress: [number, number];

	setLoading: (value: boolean) => void;
	setLoadProgress: (loaded: number, total: number) => void;
	setPages: (pages: PageData[]) => void;
	setSelectedIds: (ids: Set<string>) => void;
	addPages: (newPages: PageData[]) => void;
	removePages: (ids: Set<string>) => PageData[];
	duplicatePages: (ids: Set<string>) => void;
	rotatePages: (ids: Set<string>, degrees?: 90 | 180 | 270) => void;
	reorderPages: (newOrder: PageData[]) => void;
	insertBlankPage: (page: PageData, afterIndex?: number) => void;
	clearSelection: () => void;
	toggleSelect: (id: string, multi?: boolean) => void;
	selectRange: (id: string) => void;
	selectAll: () => void;
	resetWorkspace: () => void;
}

export const useManipulatorStore = create<ManipulatorStore>((set, get) => ({
	pages: [],
	selectedIds: new Set<string>(),
	isLoading: false,
	loadProgress: [0, 0] as [number, number],

	setLoading: (value) => set({ isLoading: value }),

	setLoadProgress: (loaded, total) => set({ loadProgress: [loaded, total] }),

	setPages: (pages) => set({ pages }),

	setSelectedIds: (ids) => set({ selectedIds: ids }),

	addPages: (newPages) =>
		set((state) => {
			const remaining = MAX_PAGES - state.pages.length;
			return { pages: [...state.pages, ...newPages.slice(0, remaining)] };
		}),

	removePages: (ids) => {
		const { pages } = get();
		const removed = pages.filter((p) => ids.has(p.id));
		set({
			pages: pages.filter((p) => !ids.has(p.id)),
			selectedIds: new Set()
		});
		return removed;
	},

	duplicatePages: (ids) =>
		set((state) => {
			const remaining = MAX_PAGES - state.pages.length;
			if (remaining <= 0) return state;
			const newPages: PageData[] = [];
			let dupeCount = 0;
			for (const page of state.pages) {
				newPages.push(page);
				if (ids.has(page.id) && dupeCount < remaining) {
					newPages.push({ ...page, id: crypto.randomUUID() });
					dupeCount++;
				}
			}
			return { pages: newPages };
		}),

	rotatePages: (ids, degreesVal = 90) =>
		set((state) => ({
			pages: state.pages.map((p) =>
				ids.has(p.id) ? { ...p, rotation: (p.rotation + degreesVal) % 360 } : p
			)
		})),

	reorderPages: (newOrder) => set({ pages: newOrder }),

	insertBlankPage: (page, afterIndex) =>
		set((state) => {
			if (state.pages.length >= MAX_PAGES) return state;
			const idx = afterIndex !== undefined ? afterIndex + 1 : state.pages.length;
			const newPages = [...state.pages];
			newPages.splice(idx, 0, page);
			return { pages: newPages };
		}),

	clearSelection: () => set({ selectedIds: new Set() }),

	toggleSelect: (id, multi = false) =>
		set((state) => {
			if (multi) {
				const next = new Set(state.selectedIds);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return { selectedIds: next };
			}
			return {
				selectedIds:
					state.selectedIds.has(id) && state.selectedIds.size === 1
						? new Set()
						: new Set([id])
			};
		}),

	selectRange: (id) =>
		set((state) => {
			if (state.selectedIds.size === 0) return { selectedIds: new Set([id]) };
			const lastSelected = [...state.selectedIds].pop()!;
			const lastIdx = state.pages.findIndex((p) => p.id === lastSelected);
			const currIdx = state.pages.findIndex((p) => p.id === id);
			if (lastIdx === -1 || currIdx === -1) return state;
			const start = Math.min(lastIdx, currIdx);
			const end = Math.max(lastIdx, currIdx);
			const range = state.pages.slice(start, end + 1).map((p) => p.id);
			return { selectedIds: new Set([...state.selectedIds, ...range]) };
		}),

	selectAll: () =>
		set((state) => ({
			selectedIds: new Set(state.pages.map((p) => p.id))
		})),

	resetWorkspace: () =>
		set({
			pages: [],
			selectedIds: new Set(),
			isLoading: false,
			loadProgress: [0, 0]
		})
}));
