const SHELL_CACHE = 'hummerkartan-shell-v10';
const MAP_CACHE = 'hummerkartan-map-v1';
const DEPTH_CACHE = 'hummerkartan-depth-v1';
const OFFLINE_PAGE = '/__hummerkartan_offline_app__';
const KEEP_CACHES = new Set([SHELL_CACHE, MAP_CACHE, DEPTH_CACHE]);
const MAP_HOSTS = new Set(['api.maptiler.com', 'cdn.maptiler.com']);
let mapWrites = 0;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('hummerkartan-') && !KEEP_CACHES.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') await cache.put(req, res.clone());
    return res;
  } catch (error) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(req, cacheName, maxEntries = 600) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    mapWrites++;
    if (mapWrites % 25 === 0) trimCache(cacheName, maxEntries).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (MAP_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(req, MAP_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/api/depth-grid' || url.pathname === '/api/depth-contours') {
    event.respondWith(networkFirst(req, DEPTH_CACHE));
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const type = res.headers.get('content-type') || '';
        const isApp = res.ok && !res.redirected && type.includes('text/html') && url.pathname !== '/login' && url.pathname !== '/login.html';
        if (isApp) {
          const cache = await caches.open(SHELL_CACHE);
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

  // Appens egna JS/CSS använder network-first. Därmed fastnar telefonen inte på en gammal version efter en deployment.
  event.respondWith(networkFirst(req, SHELL_CACHE));
});
