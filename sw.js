/**
 * Khutbah Reader — Service Worker (offline support)
 *
 * Strategy: stale-while-revalidate.
 *  - Every file is answered from the cache immediately, so the page opens
 *    instantly even with a weak or missing signal in the mosque.
 *  - When online, the file is re-fetched in the background and the cache is
 *    refreshed, so edits to the khutbah appear on the next visit.
 *
 * Bump CACHE_VERSION when files are added to or removed from PRECACHE.
 */
var CACHE_VERSION = 'khutbah-v4';

var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // cache: 'reload' bypasses the HTTP cache so the first copy is fresh
      return cache.addAll(PRECACHE.map(function (url) {
        return new Request(url, { cache: 'reload' });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations (with or without #hash / ?query) all map to index.html
  var isNavigation = req.mode === 'navigate';
  var cacheKey = isNavigation ? './index.html' : req;

  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(cacheKey, { ignoreSearch: isNavigation }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') {
            cache.put(cacheKey, res.clone());
          }
          return res;
        }).catch(function () {
          return cached;
        });

        if (cached) {
          event.waitUntil(network.catch(function () {}));
          return cached;
        }
        return network.then(function (res) {
          return res || new Response('غير متاح دون اتصال', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      });
    })
  );
});
