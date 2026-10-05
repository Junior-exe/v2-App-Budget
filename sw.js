// Mode hors-ligne : le code est mis en cache. Changer CACHE à chaque nouvelle version de l'application.
const CACHE = 'budget-v4';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'ui/app.js', 'ui/render.js', 'ui/screens.js', 'ui/routes.js', 'ui/view-model.js',
  'core/types.js', 'core/money.js', 'core/dates.js', 'core/balances.js', 'core/month.js', 'core/recurrence.js', 'core/entities.js',
  'data/store.js', 'data/backup.js', 'data/validate.js', 'data/demo.js', 'data/repository.js',
  'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});
