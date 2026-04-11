# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com), and this project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed

- Auto-crop now re-runs high-quality document detection on the captured photo instead of reusing the lower-resolution live overlay as the final crop
- Document detection scoring now better rejects quads that do not follow the actual page outline by checking boundary alignment and inside/outside contrast along each edge
- Close-up scans now better preserve the whole page by allowing near-full-frame documents, raising detection resolution, and expanding the detected quad slightly outward as a safety margin

## [0.2.3] - 2026-04-09

### Changed

- Flash button moved to bottom controls bar (left of shutter) for easy thumb access
- Camera switch button moved to top-left bar; only shown when torch AND multiple cameras are both present
- Camera flip icon updated to outline-style camera with circular-arrows inside (matching reference)
- Auto flash "A" badge repositioned to overlap the flash bolt as a compact rounded-square indicator
- Auto flash exposure delay increased from 150ms → 500ms for proper brightness

### Fixed

- CropEditor fullscreen on iOS Safari/Edge: added `webkitRequestFullscreen`, `webkitExitFullscreen`,
  `webkitFullscreenElement`, `webkitfullscreenchange` event and `:-webkit-full-screen` CSS rules

## [0.2.2] - 2026-04-09

### Changed

- Flash button moved to left side of top bar (with Close), away from Done button animation
- Auto flash mode now shows a filled white circle "A" icon badge on the flash bolt (not floating text)
- Switch camera button replaced with a custom camera-flip SVG icon (camera body + rotation arrow) for intuitive recognition

## [0.2.1] - 2026-04-09

### Added

- Flash mode toggle in camera view: Off / On / Auto — only shown when device torch is supported
- Auto flash fires the torch briefly at capture time (150 ms) then turns off automatically
- Switch camera button now only shown when multiple cameras are detected (`enumerateDevices`)
- Switch camera icon changed to `CameraAction` (camera-flip style)

## [0.2.0] - 2026-04-09

### Added

- CropEditor fullscreen mode with toggle button, enter/exit animations, and Cancel/Confirm actions
- Camera capture fly-to-done animation: captured frame flies to Done button instead of a toast
- Done button always visible in camera view; disabled/greyed when no pages captured
- Pulse animation on Done button for every capture

### Changed

- Camera viewfinder changed from `object-fit: cover` to `object-fit: contain` — full feed visible on mobile without cropping
- PDF preview close button now matches scanner style (Carbon ghost button)
- Removed decorative shadow gradients from scanner and PDF preview headers
- Tooltip max-width capped to viewport width to prevent overflow on small screens

### Fixed

- Done button count updates after the fly animation completes, not before


### Added

- Document scanner with camera capture, auto-crop, 4-corner perspective correction
- Image filters: Enhance, B&W (Otsu), Grayscale, Sharpen, Photo Color
- PDF Tools: import, merge, split, rotate, delete, duplicate, reorder, compress
- ZIP download for split PDF outputs
- Drag-and-drop page reordering
- Undo/redo with keyboard shortcuts
- Long-press context menu for touch devices
- Pinch-to-zoom on crop editor and preview
- Swipe between pages in scanner preview
- 3-way theme toggle: AMOLED Dark / Light / High Contrast
- Offline-first PWA with service worker
- Lazy route loading for performance
- Web Share API integration
- Print support
- Scanner → PDF Tools bridge
- Mobile-first responsive design (320px+)
