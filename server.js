// Husform-server: serverer appen og POST /api/analyze (bilder → hus-JSON via Claude). Node 18+.
// API-nøkkelen leses fra miljøet eller .env og forlater aldri serveren. Uten nøkkel svarer /api/status {ai:false} og appen viser demohuset.
const http = require('http'), fs = require('fs'), path = require('path');
for (const f of ['.env', '.env.local']) try {
  for (const l of fs.readFileSync(path.join(__dirname, f), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}
const E = process.env, KEY = E.ANTHROPIC_API_KEY || '', MODEL = E.CLAUDE_MODEL || 'claude-opus-5-5';
const fail = (status, error) => Object.assign(new Error(error), { status });

// Skjemaet Claude må svare i. Det er det samme som øverst i js/house.js, uten id-er (de lages i nettleseren).
const MATERIALS = ['maling', 'tre', 'panel', 'betong', 'flis', 'murstein', 'tekstil', 'metall', 'takstein'];
const FURNITURE = ['sofa', 'bord', 'stol', 'seng', 'skap', 'kjokken', 'tv', 'toalett', 'vask', 'dusj', 'lampe', 'plante', 'annet'];
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items }), N = { type: 'number' }, T = { type: 'string' }, one = values => ({ type: 'string', enum: values });
const COLOR = { type: 'string', description: 'Hex-farge, f.eks. #e9e4d8' }, MAT = one(MATERIALS);
const SCHEMA = obj({
  name: T,
  floors: list(obj({
    name: T, height: N,
    rooms: list(obj({ name: T, x: N, z: N, w: N, d: N, material: MAT, color: COLOR })),
    walls: list(obj({ x1: N, z1: N, x2: N, z2: N, thickness: N, material: MAT, color: COLOR,
      openings: list(obj({ type: one(['door', 'window']), pos: N, width: N, height: N, sill: N, color: COLOR })) })),
    furniture: list(obj({ type: one(FURNITURE), x: N, z: N, rot: N, w: N, d: N, h: N, material: MAT, color: COLOR })),
  })),
  roof: obj({ type: one(['gable', 'hip', 'flat']), pitch: N, overhang: N, material: MAT, color: COLOR }),
});
const PROMPT = `Du får bilder av ett og samme hus, tatt ute og inne. Bygg en forenklet 3D-modell av huset som ett JSON-objekt. Modellen åpnes i en editor der eieren retter den etterpå, så et sammenhengende og plausibelt hus er viktigere enn millimeterpresisjon.

Koordinater: alle mål er i meter. x går mot høyre og z mot betrakteren når huset ses forfra, y er opp. Legg husets bakre venstre hjørne i (0, 0), slik at inngangsfasaden får størst z.

Etasjer: list dem nedenfra og opp. "height" er avstanden fra gulv til gulv i etasjen over (vanligvis 2.4–2.7).

Rom: hvert rom er et rektangel med hjørnet (x, z), bredde w langs x og dybde d langs z. Tilnærm skjeve eller L-formede rom med ett eller to rektangler. Rommene i en etasje skal ligge kant i kant uten overlapp og til sammen fylle husets grunnflate. "material" og "color" beskriver gulvet.

Vegger: hver vegg er ett rett linjestykke fra (x1, z1) til (x2, z2) og skal ligge langs romkanter. Ta med ytterveggene rundt hele etasjen (thickness ca. 0.2–0.3) og innerveggene mellom rommene (ca. 0.1). En vegg som deles av to rom, skal bare stå én gang. Farge og materiale på yttervegger skal være fasadens.

Åpninger: dører og vinduer ligger i veggen de står i. "pos" er avstanden i meter fra (x1, z1) til midten av åpningen, "sill" er høyden fra gulvet til underkanten (0 for dører). Hvert rom skal ha minst én dør, og ytterdøra skal være med. Plasser vinduene der bildene viser dem.

Møbler: ta med de store møblene som faktisk synes på bildene, høyst rundt 40 til sammen. x og z er møbelets midtpunkt, rot er grader rundt y-aksen (0 betyr at ryggen eller baksiden vender mot z = 0), w × d × h er bredde, dybde og høyde. Bruk "annet" for møbler som ikke passer noen type.

Tak: velg formen som ligner mest. "pitch" er takvinkelen i grader og "overhang" er takutstikket i meter.

Mål: bruk kjente størrelser som målestokk. En dør er ca. 0.9 × 2.1, en kjøkkenbenk 0.6 dyp og 0.9 høy, en dobbeltseng 1.6–1.8 × 2.0, en sofa ca. 2 lang. Der bildene ikke viser en del av huset, gjett noe som er vanlig for et slikt hus, heller enn å la det stå tomt.

Farger er hex-koder lest av bildene. Romnavn og husets navn skal være på norsk.`;

let client;
// Bilder → hus-JSON. on(progress) kalles underveis: { stage: 'look' } når Claude har begynt, { stage: 'write', chars } mens modellen skrives.
// signal avbryter kallet (og kostnaden) når nettleseren går.
async function analyze(images, on, signal) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch { throw fail(500, 'Pakken @anthropic-ai/sdk mangler på serveren. Kjør npm install.'); }
  client ??= new Anthropic({ apiKey: KEY });
  const content = images.map((u, i) => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(u || '');
    if (!m) throw fail(400, `Bilde ${i + 1} er ikke et gyldig bilde.`);
    if (m[2].length * .75 > 5e6) throw fail(413, `Bilde ${i + 1} er for stort (over 5 MB). Last siden på nytt og velg bildene igjen, så krympes de.`);
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });
  content.push({ type: 'text', text: `Dette er ${images.length} bilder av huset. Lag modellen.` });
  let msg;
  try {
    // Strømmes fordi svaret kan bli langt. Avviser modellen forespørselen, prøver API-et selv en reservemodell (fallbacks).
    const stream = client.beta.messages.stream({
      model: MODEL, max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: PROMPT, messages: [{ role: 'user', content }],
    });
    if (signal.aborted) stream.abort(); else signal.addEventListener('abort', () => stream.abort(), { once: true });
    let chars = 0;
    stream.on('streamEvent', ev => {
      if (ev.type === 'message_start') on({ stage: 'look' });
      else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') on({ stage: 'write', chars: chars += ev.delta.text.length });
    });
    msg = await stream.finalMessage();
  } catch (e) {
    if (signal.aborted) throw fail(499, 'Avbrutt.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw fail(401, 'API-nøkkelen ble avvist av Anthropic. Sjekk ANTHROPIC_API_KEY i .env på serveren.');
    if (e instanceof Anthropic.RateLimitError) throw fail(429, 'For mange forespørsler, eller kvoten hos Anthropic er brukt opp. Vent litt og prøv igjen.');
    if (e instanceof Anthropic.NotFoundError) throw fail(502, `Modellen «${MODEL}» finnes ikke. Sjekk CLAUDE_MODEL i .env.`);
    if (e instanceof Anthropic.BadRequestError) throw fail(400, `Claude API avviste forespørselen: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw fail(502, 'Serveren fikk ikke kontakt med Claude API. Sjekk nettforbindelsen til serveren og prøv igjen.');
    if (e instanceof Anthropic.APIError && e.status === 413) throw fail(413, 'Bildene er for store til sammen for Claude API. Bruk færre bilder.');
    if (e instanceof Anthropic.APIError && e.status === 529) throw fail(503, 'Claude er overbelastet akkurat nå. Prøv igjen om noen minutter.');
    if (e instanceof Anthropic.APIError) throw fail(502, `Claude API svarte med feil ${e.status ?? ''}. Prøv igjen om litt.`);
    if (e instanceof Anthropic.AnthropicError) { console.error(e); throw fail(502, 'Forbindelsen mellom serveren og Claude API ble brutt underveis. Prøv igjen.'); }
    throw e;
  }
  if (msg.stop_reason === 'refusal') throw fail(422, 'Claude ville ikke tolke disse bildene. Prøv med andre bilder av huset.');
  if (msg.stop_reason === 'max_tokens') throw fail(502, 'Modellen ble for stor til å fullføres. Prøv med færre bilder.');
  try { return JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join('')); }
  catch { throw fail(502, 'Claude svarte ikke med gyldig JSON. Prøv igjen.'); }
}

const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const FILES = ['index.html', 'style.css', 'js/app.js', 'js/scene.js', 'js/house.js', 'manifest.json', 'service-worker.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
// Leser hele forespørselen. Er den for stor, leses resten uten å lagres, slik at nettleseren faktisk får 413-svaret.
const LIMIT = 30e6, TOO_BIG = 'Bildene er for store til sammen. Bruk færre bilder.';
const readBody = req => new Promise((ok, no) => {
  if (+req.headers['content-length'] > LIMIT) { req.resume(); return req.on('end', () => no(fail(413, TOO_BIG))); }
  const chunks = []; let n = 0;
  req.on('data', c => { if ((n += c.length) <= LIMIT) chunks.push(c); });
  req.on('end', () => {
    if (n > LIMIT) return no(fail(413, TOO_BIG));
    try { ok(JSON.parse(Buffer.concat(chunks).toString())); } catch { no(fail(400, 'Ugyldig forespørsel.')); }
  });
  req.on('error', no);
  req.on('close', () => { if (!req.complete) no(fail(499, 'Avbrutt.')); });
});
// POST /api/analyze. Feil før Claude har begynt å svare, får vanlig HTTP-status og { error }.
// Etter det strømmes linjer med JSON (NDJSON): { type: 'progress', stage, chars? } og { type: 'beat' } underveis, så { type: 'done', house } eller { type: 'error', error }.
async function analyzeRoute(req, res) {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  let started = false, last = 0, beat;
  const line = obj => res.write(JSON.stringify(obj) + '\n');
  const on = p => {
    if (!started) {
      started = true;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      beat = setInterval(() => line({ type: 'beat' }), 15000); // holder forbindelsen åpen mens Claude tenker
    }
    if (p.stage === 'write') { clearInterval(beat); const t = Date.now(); if (t - last < 400) return; last = t; }
    line({ type: 'progress', ...p });
  };
  try {
    const { images } = await readBody(req);
    if (!KEY) throw fail(503, 'Serveren har ingen API-nøkkel. Legg ANTHROPIC_API_KEY=... i filen .env og start node server.js på nytt.');
    if (!Array.isArray(images) || images.length < 5) throw fail(400, `Velg minst 5 bilder (fikk ${Array.isArray(images) ? images.length : 0}).`);
    if (images.length > 30) throw fail(400, `Du kan sende høyst 30 bilder (fikk ${images.length}).`);
    const house = await analyze(images, on, ac.signal);
    if (started) line({ type: 'done', house }); else send(res, 200, { house });
  } catch (e) {
    if (!e.status) console.error(e);
    const error = e.status ? e.message : 'Uventet feil på serveren. Se loggen der serveren kjører.';
    if (ac.signal.aborted) return;
    if (started) line({ type: 'error', error }); else send(res, e.status || 500, { error });
  } finally { clearInterval(beat); if (started) res.end(); }
}
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/status') return send(res, 200, { ai: !!KEY });
  if (url === '/api/analyze') return req.method === 'POST' ? analyzeRoute(req, res) : send(res, 405, { error: 'Bruk POST.' });
  const name = url === '/' ? 'index.html' : url.slice(1);
  if (!FILES.includes(name) || req.method !== 'GET') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ikke funnet'); }
  const type = TYPES[name.split('.').pop()];
  fs.readFile(path.join(__dirname, name), (err, buf) => { res.writeHead(err ? 500 : 200, { 'Content-Type': type + (type.startsWith('image/png') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache' }); res.end(err ? 'Feil' : buf); });
});
const PORT = +E.PORT || 3000, HOST = E.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`Husform: http://localhost:${PORT} (${KEY ? `bilder tolkes med ${MODEL} – koster penger per hus` : 'ingen API-nøkkel, bare demohus'})`));
