// Offline-Cache: App-Dateien werden gecacht, Updates werden im Hintergrund geladen.
const CACHE = 'peptide-calendar-v3';
const ASSETS = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/schedule.js', 'js/storage.js', 'js/inventory.js', 'js/merge.js', 'js/sync.js', 'js/calculator.js', 'js/calc-ui.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nur eigene App-Dateien cachen – Sync-Anfragen immer direkt ans Netz
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
