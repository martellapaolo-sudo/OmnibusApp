const CACHE_NAME = 'omnibus-pwa-v1';
const ASSETS = [
  './index.html',
  './manifest.json'
];

// Installazione e creazione cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// Intercettazione richieste (Offline First)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Ritorna la cache se esiste, altrimenti fa la chiamata di rete
      return cachedResponse || fetch(event.request);
    })
  );
});