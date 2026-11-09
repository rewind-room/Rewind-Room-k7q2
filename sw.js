// Rewind Room service worker: lets the app open without a connection.
// Pages load from the network when online (so updates arrive right away) and from the saved copy when offline.
const CACHE = 'rewind-room-v1';
const SHELL = ['./', './index.html', './apple-touch-icon.png', './favicon-64.png'];
const IMG_LIMIT = 150;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('rewind-room-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache){
  const keys = await cache.keys();
  const imgs = keys.filter(r => new URL(r.url).hostname === 'image.tmdb.org');
  for (let i = 0; i < imgs.length - IMG_LIMIT; i++) await cache.delete(imgs[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Live data is never cached
  if (url.hostname === 'api.themoviedb.org' || url.hostname === 'api.github.com') return;

  // The page itself: network first, saved copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Posters, fonts, and the app's own files: saved copy first, then fetch and save
  if (url.hostname === 'image.tmdb.org' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).then(() => caches.open(CACHE)).then(trim).catch(() => {});
        }
        return r;
      }).catch(() => hit))
    );
  }
});
