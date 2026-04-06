const CACHE_NAME = 'gigtrack-v1';
const urlsToCache = [
  './index.html',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Cached version
        }
        return fetch(event.request); // Network version
      })
  );
});
