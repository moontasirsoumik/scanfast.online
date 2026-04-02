# ScanFast.online

Free, offline-capable document scanner and PDF manipulator. No ads, no logins, no tracking.

**[scanfast.online](https://scanfast.online)**

## Features

- **Document Scanner** — Camera capture, auto-crop, filters (enhance, B&W, grayscale, sharpen), rotation
- **PDF Manipulator** — Import PDFs & images, drag-drop reorder, rotate, delete, duplicate, merge, export
- **Offline-first** — Works without internet after first load (PWA with service worker)
- **Privacy** — All processing happens in-browser. Nothing is ever uploaded
- **Mobile-first** — Designed for 320px+ screens with touch-friendly controls

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | SvelteKit (Svelte 5) + TypeScript |
| Design System | IBM Carbon |
| PDF | pdf-lib + pdfjs-dist |
| Scanning | Canvas API (filters, crop, rotation) |
| Hosting | Cloudflare Pages |

## Quick Start

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173).

## Constraints

- Max 20 pages per session (in-memory only, no database)
- Max 20 undo/redo operations
- All assets self-hosted, no external CDN/API dependencies
- Session data lost on tab close (by design)

## License

MIT

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
