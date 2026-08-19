const CACHE = 'hummerkartan-shell-v4';
const OFFLINE_PAGE = '/__hummerkartan_offline_app__';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('hummerkartan-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const type = res.headers.get('content-type') || '';
        const isApp = res.ok && !res.redirected && type.includes('text/html') && url.pathname !== '/login' && url.pathname !== '/login.html';
        if (isApp) {
          const cache = await caches.open(CACHE);
          await cache.put(OFFLINE_PAGE, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(OFFLINE_PAGE);
        if (cached) return cached;
        return new Response('Hummerkartan är offline. Anslut till internet och logga in minst en gång på den här enheten.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    const type = res.headers.get('content-type') || '';
    if (res.ok && !res.redirected && !type.includes('text/html')) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  })());
});
