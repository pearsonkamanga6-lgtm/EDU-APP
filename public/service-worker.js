const CACHE = 'reportform-zm-v3-1-6';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req=event.request,url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;}
  event.respondWith(fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req)));
});
