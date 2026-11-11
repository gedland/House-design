// Husdesign-server: serverer appen og POST /api/image. Node 18+, ingen pakker.
const http = require('http'), fs = require('fs'), path = require('path');
for (const f of ['.env', '.env.local']) try {
  for (const l of fs.readFileSync(path.join(__dirname, f), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}
const E = process.env, PROVIDER = (E.IMAGE_PROVIDER || 'demo').toLowerCase(), KEY = E.IMAGE_API_KEY || '';
const PROVIDERS = {
  gemini: { model: 'gemini-2.5-flash-image', base: 'https://generativelanguage.googleapis.com', mask: 'bw', run: gemini },
  openai: { model: 'gpt-image-1', base: 'https://api.openai.com', mask: 'alpha', run: openai },
};
const P = PROVIDERS[PROVIDER], DEMO = PROVIDER === 'demo' || !KEY;
const MODEL = E.IMAGE_MODEL || P?.model, BASE = (E.IMAGE_BASE_URL || P?.base || '').replace(/\/$/, '');
const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const FILES = ['index.html', 'style.css', 'app.js', 'provider.js', 'manifest.json', 'service-worker.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const fail = (status, error, code) => Object.assign(new Error(error), { status, code });
const part = u => { const m = /^data:([^;,]+);base64,(.+)$/s.exec(u || ''); if (!m) throw fail(400, 'Ugyldig bilde i forespørselen.'); return { mime: m[1], data: m[2] }; };

async function call(url, headers, body) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(180000) }); }
  catch (e) { throw fail(502, e.name === 'TimeoutError' ? `${PROVIDER} brukte for lang tid. Prøv igjen.` : `Fikk ikke kontakt med ${PROVIDER}. Sjekk nettforbindelsen.`); }
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
  if (r.ok) return j;
  const e = j.error || {}, msg = e.message || t.slice(0, 200), all = `${e.code} ${e.status} ${e.type} ${msg}`;
  if (r.status === 429 || r.status === 402 || /quota|credit|billing|insufficient|exhausted|rate.?limit/i.test(all))
    throw fail(429, `Kvoten eller kredittene hos ${PROVIDER} er brukt opp, eller gratiskvoten dekker ikke bildemodellen. Sjekk fakturering hos leverandøren, eller vent og prøv igjen.`, 'quota');
  if (r.status === 401 || r.status === 403 || /api.?key/i.test(all)) throw fail(401, `Nøkkelen ble avvist av ${PROVIDER}. Sjekk IMAGE_API_KEY.`, 'auth');
  if (r.status === 404) throw fail(502, `Modellen «${MODEL}» finnes ikke hos ${PROVIDER}. Sett IMAGE_MODEL til en gyldig bildemodell.`, 'model');
  if (/safety|moderation|policy/i.test(all)) throw fail(400, `Forespørselen ble stoppet av innholdsfilteret hos ${PROVIDER}. Prøv en annen beskrivelse.`, 'blocked');
  throw fail(502, `${PROVIDER} svarte med feil ${r.status}: ${msg}`);
}
// Gemini har ingen maskeparameter: masken følger med som siste bilde, forklart i teksten.
async function gemini({ prompt, images, mask }) {
  const text = prompt + (mask ? '\nDet siste bildet er en maske. Endre bare området som er hvitt i masken, og la alt annet være urørt. Ikke vis masken i resultatet.' : '');
  const parts = [{ text }, ...[...images, ...(mask ? [mask] : [])].map(u => { const { mime, data } = part(u); return { inlineData: { mimeType: mime, data } }; })];
  const j = await call(`${BASE}/v1beta/models/${MODEL}:generateContent`, { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }));
  const c = j.candidates?.[0], d = c?.content?.parts?.map(p => p.inlineData || p.inline_data).find(Boolean);
  if (!d) throw fail(502, `Gemini returnerte ikke noe bilde (${c?.finishReason || j.promptFeedback?.blockReason || 'ukjent årsak'}). Prøv en annen beskrivelse.`);
  return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
}
async function openai({ prompt, images, mask }) {
  const headers = { Authorization: `Bearer ${KEY}` }; let body, url = `${BASE}/v1/images/generations`;
  if (images.length) {
    url = `${BASE}/v1/images/edits`; body = new FormData(); body.append('model', MODEL); body.append('prompt', prompt);
    const file = (u, name) => { const { mime, data } = part(u); return [new Blob([Buffer.from(data, 'base64')], { type: mime }), `${name}.${mime.split('/')[1]}`]; };
    images.slice(0, 16).forEach((u, i) => body.append('image[]', ...file(u, `image${i}`)));
    if (mask) body.append('mask', ...file(mask, 'mask'));
  } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ model: MODEL, prompt }); }
  const b = (await call(url, headers, body)).data?.[0]?.b64_json;
  if (!b) throw fail(502, 'OpenAI returnerte ikke noe bilde. Prøv igjen.');
  return `data:image/png;base64,${b}`;
}

const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', c => { if ((n += c.length) > 60e6) { no(fail(413, 'Bildene er for store. Bruk færre eller mindre bilder.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString())); } catch { no(fail(400, 'Ugyldig forespørsel.')); } });
  req.on('error', no);
});
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/image') {
    if (req.method === 'GET') return send(res, 200, { provider: DEMO ? 'demo' : PROVIDER, demo: DEMO, mask: P?.mask || null });
    if (req.method !== 'POST') return send(res, 405, { error: 'Bruk POST.' });
    try {
      const { mode, prompt, images = [], mask = null } = await readBody(req);
      if (DEMO) return send(res, 200, { demo: true, message: 'Ingen nøkkel er satt. Demomodus gjelder: forhåndsvisningen lages i nettleseren, uten AI.' });
      if (!P) throw fail(400, `Ukjent leverandør «${PROVIDER}». Sett IMAGE_PROVIDER til demo, gemini eller openai.`, 'provider');
      if (!['edit', 'create'].includes(mode) || typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(images)) throw fail(400, 'Forespørselen mangler mode, prompt eller images.');
      if (mode === 'edit' && !images.length) throw fail(400, 'Endring krever et bilde.');
      send(res, 200, { image: await P.run({ prompt, images, mask: mode === 'edit' ? mask : null }) });
    } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Uventet feil på serveren.', code: e.code }); if (!e.status) console.error(e); }
    return;
  }
  const name = url === '/' ? 'index.html' : url.slice(1);
  if (!FILES.includes(name) || req.method !== 'GET') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ikke funnet'); }
  const type = TYPES[name.split('.').pop()];
  fs.readFile(path.join(__dirname, name), (err, buf) => { res.writeHead(err ? 500 : 200, { 'Content-Type': type + (type.startsWith('image/png') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache' }); res.end(err ? 'Feil' : buf); });
});
const PORT = +E.PORT || 3000, HOST = E.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`Husdesign: http://localhost:${PORT} (${DEMO ? 'demomodus, gratis' : `ekte AI via ${PROVIDER}, modell ${MODEL} – koster penger`})`));
