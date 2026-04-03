/** @module Scanner store — in-memory state for document scanning using Zustand. */
import { create } from 'zustand';

/** A 2D point, normalized 0–1 relative to image dimensions */
export interface Point { x: number; y: number }

/** Free-form quadrilateral crop — 4 corners in clockwise order */
export interface QuadCrop {
	tl: Point;
	tr: Point;
	br: Point;
	bl: Point;
}

/** @deprecated Use QuadCrop instead */
export type CropRect = QuadCrop;

/** Available image filter types */
export type FilterType = 'original' | 'enhance' | 'bw' | 'grayscale' | 'sharpen' | 'color';

/** Scanner workflow view states */
export type ScannerView = 'idle' | 'camera' | 'preview' | 'gallery';

/** A single scanned page with original and processed data */
export interface ScannedPage {
	id: string;
	originalBlob: Blob;
	processedDataUrl: string;
	thumbnail: string;
	filter: FilterType;
	rotation: number;
	straighten: number;
	cropRect: QuadCrop | null;
}

/** Max pages per scanning session */
export const MAX_PAGES = 20;

interface ScannerStore {
	view: ScannerView;
	pages: ScannedPage[];
	currentImage: Blob | null;
	currentFilter: FilterType;
	currentRotation: number;
	currentStraighten: number;
	currentCrop: QuadCrop | null;
	editingPageId: string | null;
	isProcessing: boolean;
	cameraFacing: 'user' | 'environment';

	setView: (view: ScannerView) => void;
	captureImage: (blob: Blob) => void;
	setFilter: (filter: FilterType) => void;
	setRotation: (degrees: number) => void;
	setStraighten: (degrees: number) => void;
	setCrop: (rect: QuadCrop | null) => void;
	setProcessing: (value: boolean) => void;
	setCameraFacing: (facing: 'user' | 'environment') => void;
	addPage: (page: ScannedPage) => boolean;
	removePage: (id: string) => void;
	editPage: (id: string) => void;
	savePage: (processedDataUrl: string, thumbnail: string) => void;
	reorderPages: (newOrder: ScannedPage[]) => void;
	resetScanner: () => void;
	resetPreview: () => void;
}

const initialPreview = {
	currentImage: null as Blob | null,
	currentFilter: 'original' as FilterType,
	currentRotation: 0,
	currentStraighten: 0,
	currentCrop: null as QuadCrop | null,
	editingPageId: null as string | null,
	isProcessing: false
};

export const useScannerStore = create<ScannerStore>((set, get) => ({
	view: 'idle',
	pages: [],
	cameraFacing: 'environment',
	...initialPreview,

	setView: (view) => set({ view }),

	captureImage: (blob) =>
		set({
			currentImage: blob,
			currentFilter: 'original',
			currentRotation: 0,
			currentStraighten: 0,
			currentCrop: null,
			editingPageId: null,
			view: 'preview'
		}),

	setFilter: (filter) => set({ currentFilter: filter }),

	setRotation: (degrees) => set({ currentRotation: ((degrees % 360) + 360) % 360 }),

	setStraighten: (degrees) =>
		set({ currentStraighten: Math.max(-15, Math.min(15, degrees)) }),

	setCrop: (rect) => set({ currentCrop: rect }),

	setProcessing: (value) => set({ isProcessing: value }),

	setCameraFacing: (facing) => set({ cameraFacing: facing }),

	addPage: (page) => {
		const { pages } = get();
		if (pages.length >= MAX_PAGES) return false;
		set({ pages: [...pages, page] });
		return true;
	},

	removePage: (id) =>
		set((state) => ({
			pages: state.pages.filter((p) => p.id !== id)
		})),

	editPage: (id) => {
		const page = get().pages.find((p) => p.id === id);
		if (!page) return;
		set({
			currentImage: page.originalBlob,
			currentFilter: page.filter,
			currentRotation: page.rotation,
			currentStraighten: page.straighten,
			currentCrop: page.cropRect,
			editingPageId: id,
			view: 'preview'
		});
	},

	savePage: (processedDataUrl, thumbnail) => {
		const state = get();
		if (!state.currentImage) return;

		const pageData: ScannedPage = {
			id: state.editingPageId ?? crypto.randomUUID(),
			originalBlob: state.currentImage,
			processedDataUrl,
			thumbnail,
			filter: state.currentFilter,
			rotation: state.currentRotation,
			straighten: state.currentStraighten,
			cropRect: state.currentCrop
		};

		if (state.editingPageId) {
			set({
				pages: state.pages.map((p) =>
					p.id === state.editingPageId ? pageData : p
				)
			});
		} else {
			if (state.pages.length >= MAX_PAGES) return;
			set({ pages: [...state.pages, pageData] });
		}

		get().resetPreview();
		set({ view: get().pages.length > 0 ? 'gallery' : 'idle' });
	},

	reorderPages: (newOrder) => set({ pages: newOrder }),

	resetScanner: () =>
		set({
			view: 'idle',
			pages: [],
			cameraFacing: 'environment',
			...initialPreview
		}),

	resetPreview: () => set({ ...initialPreview })
}));
