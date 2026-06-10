const CACHE_NAME = 'omnibus-pwa-v1';

// Nota l'aggiunta di './' per coprire l'URL base della repo di GitHub
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// 1. Installazione e salvataggio iniziale
self.addEventListener('install', event => {
  self.skipWaiting(); // Forza l'installazione immediata del nuovo service worker
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Attivazione e pulizia vecchie cache (utile per futuri aggiornamenti)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. Intercettazione richieste (Network First, Fallback to Cache)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Se la rete risponde correttamente, aggiorniamo la cache silenziosamente
        // (clonando la risposta perché può essere consumata una sola volta)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se siamo offline (il fetch fallisce), peschiamo dalla cache
        return caches.match(event.request);
      })
  );
});
