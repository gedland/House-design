// Husform-server: serverer appen. Node 18+, ingen pakker.
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const FILES = ['index.html', 'style.css', 'js/app.js', 'js/scene.js', 'js/house.js', 'manifest.json', 'service-worker.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], name = url === '/' ? 'index.html' : url.slice(1);
  if (!FILES.includes(name) || req.method !== 'GET') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ikke funnet'); }
  const type = TYPES[name.split('.').pop()];
  fs.readFile(path.join(__dirname, name), (err, buf) => { res.writeHead(err ? 500 : 200, { 'Content-Type': type + (type.startsWith('image/png') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache' }); res.end(err ? 'Feil' : buf); });
});
const PORT = +process.env.PORT || 3000, HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`Husform: http://localhost:${PORT}`));
