// Cacher appen så den virker uten nett. Øk VERSION når filene endres.
const VERSION = 'husform-v20';
const FILES = ['./', 'index.html', 'style.css', 'js/app.js', 'js/scene.js', 'js/house.js', 'js/surroundings.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Teksturene (textures/) står ikke i FILES: de er for store til forhåndslageret og caches først når en modell trenger dem.
// Nett først, cache når nettet mangler. Appens egne filer hentes alltid ferske fra tjeneren (no-cache), ellers kan en ny
// index.html havne sammen med gammel app.js fra nettleserens mellomlager. Teksturene følger tjenerens Cache-Control (en uke),
// så de lastes ikke ned på nytt ved hvert besøk. Three.js og skrifter fra CDN caches ved første besøk.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  const fresh = url.origin === location.origin && !url.pathname.includes('/textures/');
  e.respondWith(fetch(e.request, fresh ? { cache: 'no-cache' } : {}).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' && await caches.match('index.html')) || Response.error()));
});
