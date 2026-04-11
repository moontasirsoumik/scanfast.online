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
export type FilterType = 'original' | 'enhance' | 'document' | 'bw' | 'grayscale' | 'sharpen' | 'color' | 'warm' | 'cool' | 'fade' | 'vivid';

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
	flipH: boolean;
	flipV: boolean;
	perspectiveH: number;
	perspectiveV: number;
	brightness: number;
	contrast: number;
	shadows: number;
	filterIntensity: number;
	sharpness: number;
	warmth: number;
	saturation: number;
	highlights: number;
	vignette: number;
}

/** Image adjustment options passed through the pipeline */
export interface ImageAdjustments {
	flipH: boolean;
	flipV: boolean;
	perspectiveH: number;
	perspectiveV: number;
	brightness: number;
	contrast: number;
	shadows: number;
	filterIntensity: number;
	sharpness: number;
	warmth: number;
	saturation: number;
	highlights: number;
	vignette: number;
}

/** Max pages per scanning session */
export const MAX_PAGES = 50;

interface ScannerStore {
	view: ScannerView;
	pages: ScannedPage[];
	currentImage: Blob | null;
	currentFilter: FilterType;
	currentRotation: number;
	currentStraighten: number;
	currentCrop: QuadCrop | null;
	currentFlipH: boolean;
	currentFlipV: boolean;
	currentPerspectiveH: number;
	currentPerspectiveV: number;
	currentBrightness: number;
	currentContrast: number;
	currentShadows: number;
	filterIntensity: number;
	currentSharpness: number;
	currentWarmth: number;
	currentSaturation: number;
	currentHighlights: number;
	currentVignette: number;
	editingPageId: string | null;
	isProcessing: boolean;
	cameraFacing: 'user' | 'environment';

	setView: (view: ScannerView) => void;
	captureImage: (blob: Blob) => void;
	setFilter: (filter: FilterType) => void;
	setRotation: (degrees: number) => void;
	setStraighten: (degrees: number) => void;
	setCrop: (rect: QuadCrop | null) => void;
	setFlipH: (v: boolean) => void;
	setFlipV: (v: boolean) => void;
	setPerspectiveH: (v: number) => void;
	setPerspectiveV: (v: number) => void;
	setBrightness: (v: number) => void;
	setContrast: (v: number) => void;
	setShadows: (v: number) => void;
	setFilterIntensity: (v: number) => void;
	setSharpness: (v: number) => void;
	setWarmth: (v: number) => void;
	setSaturation: (v: number) => void;
	setHighlights: (v: number) => void;
	setVignette: (v: number) => void;
	setProcessing: (value: boolean) => void;
	setCameraFacing: (facing: 'user' | 'environment') => void;
	addPage: (page: ScannedPage) => boolean;
	addPages: (pages: ScannedPage[]) => void;
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
	currentFlipH: false,
	currentFlipV: false,
	currentPerspectiveH: 0,
	currentPerspectiveV: 0,
	currentBrightness: 0,
	currentContrast: 0,
	currentShadows: 0,
	filterIntensity: 100,
	currentSharpness: 0,
	currentWarmth: 0,
	currentSaturation: 0,
	currentHighlights: 0,
	currentVignette: 0,
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
			currentFlipH: false,
			currentFlipV: false,
			currentPerspectiveH: 0,
			currentPerspectiveV: 0,
			currentBrightness: 0,
			currentContrast: 0,
			currentShadows: 0,
			filterIntensity: 100,
			currentSharpness: 0,
			currentWarmth: 0,
			currentSaturation: 0,
			currentHighlights: 0,
			currentVignette: 0,
			editingPageId: null,
			view: 'preview'
		}),

	setFilter: (filter) => set({ currentFilter: filter }),

	setRotation: (degrees) => set({ currentRotation: ((degrees % 360) + 360) % 360 }),

	setStraighten: (degrees) =>
		set({ currentStraighten: Math.max(-15, Math.min(15, degrees)) }),

	setCrop: (rect) => set({ currentCrop: rect }),

	setFlipH: (v) => set({ currentFlipH: v }),
	setFlipV: (v) => set({ currentFlipV: v }),
	setPerspectiveH: (v) => set({ currentPerspectiveH: Math.max(-50, Math.min(50, v)) }),
	setPerspectiveV: (v) => set({ currentPerspectiveV: Math.max(-50, Math.min(50, v)) }),
	setBrightness: (v) => set({ currentBrightness: Math.max(-100, Math.min(100, v)) }),
	setContrast: (v) => set({ currentContrast: Math.max(-100, Math.min(100, v)) }),
	setShadows: (v) => set({ currentShadows: Math.max(-100, Math.min(100, v)) }),
	setFilterIntensity: (v) => set({ filterIntensity: Math.max(0, Math.min(100, v)) }),
	setSharpness: (v) => set({ currentSharpness: Math.max(-100, Math.min(100, v)) }),
	setWarmth: (v) => set({ currentWarmth: Math.max(-100, Math.min(100, v)) }),
	setSaturation: (v) => set({ currentSaturation: Math.max(-100, Math.min(100, v)) }),
	setHighlights: (v) => set({ currentHighlights: Math.max(-100, Math.min(100, v)) }),
	setVignette: (v) => set({ currentVignette: Math.max(0, Math.min(100, v)) }),

	setProcessing: (value) => set({ isProcessing: value }),

	setCameraFacing: (facing) => set({ cameraFacing: facing }),

	addPage: (page) => {
		const { pages } = get();
		if (pages.length >= MAX_PAGES) return false;
		set({ pages: [...pages, page] });
		return true;
	},

	addPages: (newPages) => {
		const { pages } = get();
		const remaining = MAX_PAGES - pages.length;
		if (remaining <= 0) return;
		set({ pages: [...pages, ...newPages.slice(0, remaining)] });
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
			currentFlipH: page.flipH,
			currentFlipV: page.flipV,
			currentPerspectiveH: page.perspectiveH,
			currentPerspectiveV: page.perspectiveV,
			currentBrightness: page.brightness,
			currentContrast: page.contrast,
			currentShadows: page.shadows,
			filterIntensity: page.filterIntensity,
			currentSharpness: page.sharpness,
			currentWarmth: page.warmth,
			currentSaturation: page.saturation,
			currentHighlights: page.highlights,
			currentVignette: page.vignette,
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
			cropRect: state.currentCrop,
			flipH: state.currentFlipH,
			flipV: state.currentFlipV,
			perspectiveH: state.currentPerspectiveH,
			perspectiveV: state.currentPerspectiveV,
			brightness: state.currentBrightness,
			contrast: state.currentContrast,
			shadows: state.currentShadows,
			filterIntensity: state.filterIntensity,
			sharpness: state.currentSharpness,
			warmth: state.currentWarmth,
			saturation: state.currentSaturation,
			highlights: state.currentHighlights,
			vignette: state.currentVignette
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
