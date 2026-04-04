/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
declare const __BUILD_TIMESTAMP__: string;
declare const __PRECACHE_ASSETS__: string[];

/** Cache name includes build timestamp — each deploy creates a new cache */
const CACHE_NAME = `scanfast-${__BUILD_TIMESTAMP__}`;

/** Core shell + all build assets injected by Vite plugin */
const PRECACHE_URLS = [
	'/',
	'/index.html',
	'/manifest.json',
	'/pdf.worker.min.mjs',
	...__PRECACHE_ASSETS__
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE_NAME) {
					await caches.delete(key);
				}
			}
			return self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;

	// Navigation requests: network-first (always try to get the latest HTML)
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

	// Hashed assets (e.g. /assets/ManipulatorPage-Xyz123.js): cache-first
	// These filenames change per build, so a cache hit is always correct.
	if (url.pathname.startsWith('/assets/')) {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) return cached;
				return fetch(event.request).then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				});
			})
		);
		return;
	}

	// Other same-origin requests (manifest, worker, icons): network-first
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			})
			.catch(() => caches.match(event.request).then((cached) => cached ?? new Response('Offline', { status: 503 })))
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
