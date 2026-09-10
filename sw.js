// Smart Dog Feeder PWA Service Worker
// v2.1.0 — Force reload clients on update, network-first HTML
const CACHE_NAME = 'dogfeeder-v2.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

// Install: Cache core assets & force activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: Delete ALL old caches, take control, then force-reload all open pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Force all open tabs to reload with new content
      return self.clients.matchAll({ type: 'window' });
    }).then((windowClients) => {
      windowClients.forEach((client) => {
        client.navigate(client.url);
      });
    })
  );
});

// Fetch: Network-First for HTML, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for WebSocket, MQTT, API calls
  if (url.protocol === 'wss:' || url.protocol === 'ws:' ||
      url.hostname.includes('emqx') || url.hostname.includes('mqtt') ||
      url.pathname.includes('/api') || url.pathname.includes('/feed') ||
      url.port === '80') {
    return;
  }

  // Network-First for HTML documents (always get latest version)
  if (event.request.destination === 'document' || event.request.url.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Network-First for sw.js itself
  if (event.request.url.endsWith('sw.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-First for static assets (icons, manifest)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => {});
    })
  );
});