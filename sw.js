/**
 * Khutbah Reader — offline support (Service Worker)
 *
 * - The page, styles and script are fetched from the network first, so the
 *   newest khutbah always appears when there is a connection. If the network
 *   is missing or slower than NETWORK_TIMEOUT, the saved copy is shown.
 * - Fonts and icons rarely change, so they are served from the saved copy.
 *
 * Bump CACHE_VERSION only when files are added to or removed from PRECACHE.
 */
var CACHE_VERSION = 'khutbah-reader-v1';
var NETWORK_TIMEOUT = 4000;

var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './fonts/uthman-taha-naskh-bold.woff2',
  './fonts/uthman-taha-naskh-regular.woff2',
  './fonts/almaghribi-warsh-quran.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (url) {
        return new Request(url, { cache: 'reload' });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(request, cacheKey) {
  return caches.open(CACHE_VERSION).then(function (cache) {
    return new Promise(function (resolve) {
      var settled = false;
      var fallback = function () {
        if (settled) return;
        cache.match(cacheKey, { ignoreSearch: true }).then(function (hit) {
          if (hit && !settled) { settled = true; resolve(hit); }
        });
      };
      var timer = setTimeout(fallback, NETWORK_TIMEOUT);

      fetch(request, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) cache.put(cacheKey, res.clone());
        clearTimeout(timer);
        if (!settled) { settled = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        cache.match(cacheKey, { ignoreSearch: true }).then(function (hit) {
          if (!settled) {
            settled = true;
            resolve(hit || new Response('غير متاح دون اتصال', {
              status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }));
          }
        });
      });
    });
  });
}

function cacheFirst(request) {
  return caches.open(CACHE_VERSION).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
  } else if (/\/(fonts|icons)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, req));
  }
});
