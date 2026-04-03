# ScanFastOnline

**Free, offline-capable document scanner and PDF manipulator. No ads, no logins, no tracking.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-scanfast.online-brightgreen)](https://scanfast.online)

Everything runs in your browser. Nothing is ever uploaded.

---

## Features

- **Document Scanner** — Camera capture with 4-corner perspective correction, auto-crop, and live viewfinder
- **Image Filters** — Enhance, B&W (Otsu threshold), Grayscale, Sharpen, Photo Color — all Canvas API, no server
- **PDF Manipulator** — Import, merge, split, rotate, delete, duplicate, reorder, and compress PDFs
- **Drag-and-Drop** — Reorder pages visually with drag-and-drop on desktop and touch devices
- **Offline-First** — PWA with service worker; works without internet after first load
- **Privacy** — All processing happens client-side. Zero network requests at runtime
- **Mobile-First** — Designed for 320px+ screens with touch gestures (pinch-to-zoom, swipe, long-press)
- **Undo/Redo** — Full command history with keyboard shortcuts
- **Export Options** — PDF, JPEG/PNG, print, Web Share API, ZIP for split outputs
- **Scanner → Manipulator Bridge** — Send scanned pages directly into the PDF manipulator

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19 |
| Bundler | Vite | 7 |
| Language | TypeScript | strict mode |
| Design System | IBM Carbon (`@carbon/react`) | 1.x |
| State | Zustand | 5.x |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | 6.x / 10.x |
| PDF Creation | pdf-lib | 1.17 |
| PDF Rendering | pdfjs-dist | 5.x |
| Image Processing | Canvas API | native |
| Hosting | Cloudflare Pages | — |

## Quick Start

```sh
git clone https://github.com/moontasirsoumik/scanfast.online.git
cd scanfast.online
npm install
npm run dev
```

Vite will print the local URL in the terminal (e.g. `http://localhost:5173`). The port is chosen automatically and may differ if 5173 is already in use.

Build for production:

```sh
npm run build
npm run preview
```

## Project Structure

```
src/
├── pages/           # HomePage, ScannerPage, ManipulatorPage, AboutPage
├── components/
│   ├── scanner/     # CameraView, CropEditor, FilterBar, PageGallery, RotationControls
│   ├── manipulator/ # Toolbar, PageGrid, PageThumbnail, DropZone, SplitDialog, CompressDialog
│   └── shared/      # Toast
├── stores/          # Zustand stores (scanner, manipulator, history, toast)
├── services/        # pdf.ts, camera.ts, filters.ts, zip.ts
├── App.tsx          # Shell, routing, theme toggle
└── main.tsx         # Entry point
static/
├── manifest.json    # PWA manifest
└── pdf.worker.min.mjs
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all pages |
| `Delete` | Delete selected pages |
| `←` `→` `↑` `↓` | Navigate page grid |

## Limitations

- **20 pages per session** — all data is held in memory, no database
- **20 undo/redo operations** — older operations are dropped
- **Session data lost on tab close** — by design, for privacy
- **No server-side processing** — large files may be slow on low-end devices
- **No OpenCV edge detection yet** — manual crop handles only for now

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## License

[MIT](LICENSE) © 2026 Moontasir Soumik
