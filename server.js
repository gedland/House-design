// Start: IMAGE_API_KEY="<key-id>:<key-secret>" node server.js  ->  http://localhost:3000
// POST /api/image {mode:'edit'|'create', prompt, images:[dataURL], mask?:dataURL} -> {image: dataURL}
const http = require('http'), fs = require('fs'), path = require('path');
const KEY = process.env.IMAGE_API_KEY, PORT = process.env.PORT || 3000;
const API = process.env.IMAGE_API_URL || 'https://platform.higgsfield.ai';
const EDIT = process.env.IMAGE_MODEL_EDIT || 'bytedance/seedream/v4/edit';            // bildereferanse: beholder form og vinkel
const CREATE = process.env.IMAGE_MODEL_CREATE || 'bytedance/seedream/v4/text-to-image';
const FILES = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/provider.js': ['provider.js', 'text/javascript'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function hf(url, body) {
  const r = await fetch(url.startsWith('http') ? url : `${API}/${url}`, { method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
    headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' } });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'bildetjenesten avviste API-nøkkelen (sjekk IMAGE_API_KEY)' : `bildetjenesten svarte ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
async function upload(dataUrl) { // modellen tar imot URL-er, så bildene lastes opp først
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return dataUrl;
  const { public_url, upload_url } = await hf('files/generate-upload-url', { content_type: m[1] });
  const r = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': m[1] }, body: Buffer.from(m[2], 'base64') });
  if (!r.ok) throw new Error(`opplasting av bilde feilet (${r.status})`);
  return public_url;
}
async function generate({ mode, prompt, images = [] }) { // mask ignoreres: modellen har ikke maskeinngang (se README)
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt mangler');
  if (mode === 'edit' && !images.length) throw new Error('bilde mangler');
  const urls = await Promise.all(images.slice(0, 4).map(upload));
  const job = await hf(urls.length ? EDIT : CREATE, urls.length ? { prompt, image_urls: urls, resolution: '2K' } : { prompt, resolution: '2K', aspect_ratio: '4:3' });
  const status = job.status_url || `requests/${job.request_id}/status`;
  for (let i = 0, s = job; i < 120; i++, await sleep(2000), s = await hf(status)) {
    if (s.status === 'completed') {
      const url = s.images?.[0]?.url;
      if (!url) throw new Error('svaret manglet bilde');
      const r = await fetch(url);
      if (!r.ok) throw new Error(`kunne ikke hente resultatet (${r.status})`);
      return { image: `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` };
    }
    if (s.status === 'nsfw') throw new Error('bildet ble stoppet av innholdsfilteret');
    if (s.status === 'failed' || s.status === 'canceled') throw new Error('bildemodellen klarte ikke å lage bildet');
  }
  throw new Error('bildemodellen brukte for lang tid');
}

http.createServer(async (req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = req.url.split('?')[0];
  if (url === '/api/image') {
    if (req.method === 'GET') return json(200, { ready: !!KEY });
    if (req.method !== 'POST') return json(405, { error: 'bruk POST' });
    if (!KEY) return json(503, { demo: true, error: 'IMAGE_API_KEY er ikke satt på serveren' });
    try {
      const chunks = []; let n = 0;
      for await (const c of req) { if ((n += c.length) > 6e7) throw new Error('bildene er for store'); chunks.push(c); }
      json(200, await generate(JSON.parse(Buffer.concat(chunks).toString())));
    } catch (e) { console.error(e.message); json(502, { error: e.message || 'ukjent feil' }); }
    return;
  }
  const f = FILES[url];
  if (!f || req.method !== 'GET') { res.writeHead(404); return res.end('Fant ikke siden'); }
  fs.readFile(path.join(__dirname, f[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Feil'); }
    res.writeHead(200, { 'Content-Type': `${f[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(data);
  });
}).listen(PORT, () => console.log(`Husform: http://localhost:${PORT} (${KEY ? 'bildemodell: ' + EDIT : 'demomodus, IMAGE_API_KEY mangler'})`));
