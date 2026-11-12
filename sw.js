/* Temporary cleanup file: removes the offline copy saved by the earlier
   version, then unregisters itself and reloads open pages. It is not part
   of the reader and can be deleted after a few days. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      return self.clients.matchAll({ type: 'window' });
    }).then(function (clients) {
      clients.forEach(function (c) { c.navigate(c.url); });
    })
  );
});
