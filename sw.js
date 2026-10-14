// Offline-Betrieb (z. B. iPad an der Rennstrecke ohne Netz).
// Eigene Dateien: zuerst aus dem Netz, damit Updates sofort ankommen; offline aus dem Speicher.
// Wetter und Reifen-Dienst werden nicht gespeichert.
const CACHE = 'mg-racing-v1';
const APP_FILES = ['./', 'index.html', 'styles.css', 'workflow.css', 'dashboard-overrides.css', 'warning-overrides.css', 'analysis-overrides.css', 'tyre-overrides.css', 'tyre-catalog.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(url.pathname, copy)); }
    return response;
  }).catch(() => caches.match(url.pathname, { ignoreSearch: true }).then(cached => cached || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
