const CACHE_NAME = 'faxtrix-shell-v3';
const SHELL_FILES = [
  'index.html',
  'site.html',
  'manifest.json',
  'assets/css/style.css',
  'assets/css/app.css',
  'assets/js/app.js',
  'assets/img/faxtrix-mark.webp',
  'assets/img/pwa/icon-192.png',
  'assets/img/pwa/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Ne met en cache que les fichiers du site lui-même (même origine).
// Toutes les requêtes vers Supabase (autre domaine) passent directement au réseau, jamais interceptées ni mises en cache.
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
