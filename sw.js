const CACHE='hummerkartan-shell-v3';
const SHELL=['./index.html','./styles.css','./app.js','./depth.js','./manifest.webmanifest','./icon.svg','./vendor/pbf.js','./vendor/vector-tile.js','./vendor/point-geometry.js'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hummerkartan-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.pathname.startsWith('/api/')||url.origin!==location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req).then(res=>{
        if(res.ok&&!res.redirected&&url.pathname!=='/login'&&url.pathname!=='/login.html'){
          const clone=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',clone));
        }
        return res;
      }).catch(()=>caches.match('./index.html').then(cached=>cached||Response.error()))
    );
    return;
  }

  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
    if(res.ok&&!res.redirected){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone))}
    return res;
  })));
});
