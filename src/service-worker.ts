/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
declare const __BUILD_TIMESTAMP__: string;

/** Cache name includes build timestamp — each deploy creates a new cache */
const CACHE_NAME = `scanfast-${__BUILD_TIMESTAMP__}`;

/** Assets to pre-cache on install */
const PRECACHE_URLS = [
	'/',
	'/index.html',
	'/manifest.json',
	'/pdf.worker.min.mjs'
];

self.addEventListener('install', (event) => {
	// Force this version to activate immediately
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	// Delete ALL old caches — new deploy means fresh start
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE_NAME) {
					await caches.delete(key);
				}
			}
			// Take control of all clients immediately
			return self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip cross-origin requests
	if (url.origin !== location.origin) return;

	// Navigation requests (HTML): network-first so new SW is discovered quickly
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					return response;
				})
				.catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
				.then((r) => r ?? new Response('Offline', { status: 503 }))
		);
		return;
	}

	// Static assets: cache-first with network fallback
	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;

			return fetch(event.request).then((response) => {
				if (
					response.ok &&
					(url.pathname.endsWith('.wasm') ||
						url.pathname.endsWith('.js') ||
						url.pathname.endsWith('.mjs') ||
						url.pathname.endsWith('.css') ||
						url.pathname.endsWith('.svg') ||
						url.pathname.endsWith('.png') ||
						url.pathname.endsWith('.jpg'))
				) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			});
		})
	);
});

/** Notify clients when a new version is available */
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
