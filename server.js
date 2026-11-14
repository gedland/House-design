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

// Skjemaet Claude må svare i: en kort befaring (survey) og huset. Huset er det samme som øverst i js/house.js, uten id-er
// (de lages av normalize). Befaringen tvinger frem arbeidsrekkefølgen og logges, så tolkningen kan feilsøkes.
const HOUSE = import('./js/house.js');
const MATERIALS = ['maling', 'tre', 'panel', 'betong', 'flis', 'murstein', 'tekstil', 'metall', 'takstein'];
const FURNITURE = ['sofa', 'bord', 'stol', 'seng', 'skap', 'kjokken', 'tv', 'toalett', 'vask', 'dusj', 'lampe', 'plante', 'annet'];
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items }), N = { type: 'number' }, T = { type: 'string' }, one = values => ({ type: 'string', enum: values });
const say = (description, s = T) => ({ ...s, description });
const COLOR = say('Hex-farge lest av bildene, f.eks. #e9e4d8'), MAT = one(MATERIALS);
const SCHEMA = obj({
  survey: obj({
    photos: list(obj({ photo: { type: 'integer' }, view: one(['ute', 'inne']), shows: say('Hva bildet viser: hvilken fasade eller hvilket rom, sett fra hvor') })),
    exterior: say('Grunnform, lengde og bredde, og hvilke kjente størrelser målene er regnet ut fra'),
    floors_and_roof: say('Antall etasjer, etasjehøyder, takform og takvinkel, med begrunnelse'),
    rooms: say('Rommene i hver etasje, hvor de ligger i forhold til fasadene, og hva plasseringen bygger på'),
    openings: say('Dører og vinduer per fasade (forside, bakside, venstre, høyre) og viktige innerdører'),
    guesses: say('Det som ikke synes i bildene og derfor er anslått. Kort, på vanlig norsk, til eieren av huset'),
  }),
  house: obj({
    name: T,
    floors: list(obj({
      name: T, height: say('Meter fra gulv til gulv i etasjen over. Øverste etasje: vegghøyde opp til takfoten', N),
      rooms: list(obj({ name: T, x: N, z: N, w: N, d: N, material: MAT, color: COLOR })),
      walls: list(obj({ x1: N, z1: N, x2: N, z2: N, thickness: N, exterior: say('true for yttervegger', { type: 'boolean' }), material: MAT, color: COLOR,
        openings: list(obj({ type: one(['door', 'window']), pos: say('Meter langs veggen fra (x1, z1) til midten av åpningen', N), width: N, height: N, sill: N, material: say('Dørbladet eller vinduskarmen', MAT), color: COLOR })) })),
      furniture: list(obj({ type: one(FURNITURE), x: N, z: N, rot: say('0: baksiden mot z = 0. 90: mot x = 0 (venstre). 180: mot forsiden. -90: mot høyre', N), w: N, d: N, h: N, material: MAT, color: COLOR })),
    })),
    roof: obj({ type: one(['gable', 'hip', 'flat']), pitch: N, overhang: N, material: MAT, color: COLOR }),
  }),
});
const PROMPT = `Du får bilder av ett og samme hus, tatt ute og inne, merket «Bilde 1», «Bilde 2» osv. Lag en forenklet 3D-modell av huset som ett JSON-objekt. Eieren åpner modellen i en editor og retter detaljer etterpå. Det som teller, er at modellen ligner huset: riktig grunnform og størrelse, riktig antall etasjer, riktig takform, dører og vinduer på riktig fasade og omtrent riktig sted, og riktige farger. Huset skal alltid være helt og lukket, også der bildene ikke viser alt.

# Koordinater
Alle mål er i meter. Se huset forfra, mot inngangsfasaden (fasaden med hoveddøren): x går mot høyre, z går mot deg, y er opp. Husets bakre venstre hjørne ligger i (0, 0), så inngangsfasaden får størst z, venstre gavl ligger ved x = 0 og baksiden ved z = 0.

# Arbeidsrekkefølge
Arbeid i denne rekkefølgen, og skriv det du finner kort i "survey" før du fyller ut "house".

1. Bildene. Gå gjennom hvert bilde: er det tatt ute eller inne, og hva viser det? Finn inngangsfasaden og bestem hvilke bilder som viser venstre side, høyre side og baksiden. Inne: hvilket rom, og mot hvilken fasade ser kameraet?
2. Ytre form og grunnflate, fra utebildene. Er grunnflaten rektangulær, L-formet eller noe annet? Anslå lengde og bredde ut fra kjente størrelser (se Mål). Sjekk at fasadene stemmer med hverandre: forsiden og baksiden er like lange, og gavlene er like brede.
3. Etasjer og tak. Tell etasjene på fasadene. En sokkel- eller kjelleretasje med vinduer over bakken er nederste etasje. En loftsetasje under skråtak, med vinduer i gavlen eller i ark, er en egen etasje med lav vegghøyde (knevegg ca. 1.0–1.6 m). Velg takformen som ligner mest, og anslå takvinkelen ut fra gavltrekanten.
4. Rominndeling, fra innebildene. Finn ut hvilke rom som finnes og hvor de ligger. Bruk vinduene: et vindu du ser innenfra, er et av vinduene på fasadene, så rommet ligger bak den fasaden. Bruk også utsikt, lysinnfall og hvilke rom som ses gjennom døråpninger. Rom som ikke er fotografert, men som et slikt hus nesten alltid har (gang, bad, soverom, bod), legger du der det er plass.
5. Dører og vinduer. Plasser hver åpning i riktig vegg: fasaden den sees på utenfra, eller veggen den sees i innenfra. Tell vinduene per fasade og legg dem i samme rekkefølge og med omtrent samme avstand fra hjørnene som på bildene, med riktig bredde, høyde og brystning.
6. Møbler. Til slutt de store møblene som synes på bildene, i riktig rom og langs riktig vegg.

# Mål
Det finnes ingen målestokk i bildene utenom kjente ting. Regn ut fra dem, og sammenlign flere:
- Dør: 2.1 høy. Innerdør 0.8–0.9 bred, ytterdør 0.9–1.0 bred.
- Etasjehøyde fra gulv til gulv: ca. 2.6–2.8 (takhøyde inne ca. 2.4). På fasaden er det ca. 2.7 m fra vindusrad til vindusrad.
- Kjøkkenbenk: 0.9 høy og 0.6 dyp. Overskap begynner ca. 1.45 over gulvet.
- Vindu i stue og soverom: brystning ca. 0.8–0.9, overkant ca. 2.1 over gulvet.
- Trappetrinn: ca. 0.18 høyt. Kledningsbord: 0.15–0.2 bredt. Murstein: ca. 0.075 per skift med fuge.
- Dobbeltseng 1.6–1.8 × 2.0, sofa ca. 2.0–2.4 lang, spisebord ca. 0.75 høyt, personbil ca. 4.5 × 1.8.
Kontroller at målene går opp: rommene langs en fasade skal til sammen bli like lange som fasaden. En vanlig norsk enebolig er 7–14 m lang og 6–10 m bred.

# Det du ikke ser
Anslå noe vanlig for et hus av denne typen og alderen, aldri la noe mangle. Svaret skal alltid ha: lukkede yttervegger rundt hver etasje, rom som fyller hver etasje, minst én ytterdør, en dør inn til hvert rom, og tak. Skriv i survey.guesses hva du har anslått uten å se det.

# Formatet
- Etasjer listes nedenfra og opp. "height" er avstanden fra gulv til gulv. For øverste etasje er det vegghøyden opp til takfoten.
- Rom er rektangler: hjørnet (x, z), bredde w langs x og dybde d langs z. Lag rom med skrå eller L-formet planløsning som to rektangler. Rommene i en etasje ligger kant i kant, uten overlapp, og fyller hele flaten innenfor ytterveggene. "material" og "color" beskriver gulvet.
- Vegger er rette linjestykker fra (x1, z1) til (x2, z2), langs veggens midtlinje og langs romkantene. Sett "exterior": true på yttervegger. Ytterveggene i hver etasje skal danne én lukket ring: hver vegg begynner nøyaktig der den forrige slutter, og den siste slutter der den første begynte. Gå gjerne rundt huset i én retning. Innervegger går mellom rom og ender inntil en annen vegg. En vegg mellom to rom skal bare være med én gang. Tykkelse: yttervegg ca. 0.25, innervegg ca. 0.1. Farge og materiale på yttervegger er fasadens.
- Åpninger ligger i veggen de står i. "pos" er avstanden langs veggen fra (x1, z1) til midten av åpningen, så det har betydning hvilken ende av veggen som er (x1, z1). Hele åpningen skal ligge innenfor veggen, minst 0.1 fra endene, og åpninger i samme vegg skal ikke overlappe. "sill" er høyden fra gulvet til underkanten, 0 for dører. sill + height skal være lavere enn etasjehøyden.
- Møbler: x og z er midtpunktet, og hele møbelet skal stå inne i rommet. w er bredden fra side til side, d er dybden forfra og bakover, h er høyden. "rot" er retningen i grader: 0 betyr at baksiden vender mot z = 0, 90 at den vender mot x = 0 (venstre), 180 mot inngangsfasaden og -90 mot høyre. Bruk "annet" for møbler som ikke passer noen type. Ta med høyst rundt 40 møbler.
- Tak: "gable" (saltak), "hip" (valmtak) eller "flat". "pitch" er takvinkelen i grader, "overhang" er takutstikket i meter. Mønet går langs husets lengste side.
- Farger er hex-koder lest av bildene: fasade, tak, vindusrammer, dører og gulv. Rom og hus får navn på norsk. Gi huset et kort, beskrivende navn, for eksempel «Rødt hus med saltak».`;
const FIX = problems => `Kontrollen av huset fant disse feilene:
${problems.map(p => `- ${p.text}`).join('\n')}

Rett feilene og send hele huset på nytt i samme format, med survey oppdatert. Behold det som var riktig. Husk at ytterveggene i hver etasje skal danne én lukket ring der hver vegg begynner nøyaktig der den forrige slutter, og at rommene skal ligge innenfor ytterveggene, kant i kant uten overlapp, og fylle hele flaten.`;

let client;
// Ett kall til Claude. on(progress) får { stage } når svaret begynner og { stage, chars } mens modellen skrives.
async function ask(Anthropic, messages, on, signal, stage) {
  let msg;
  try {
    // Strømmes fordi svaret kan bli langt. Avviser modellen forespørselen, prøver API-et selv en reservemodell (fallbacks).
    const stream = client.beta.messages.stream({
      model: MODEL, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: PROMPT, messages,
    });
    if (signal.aborted) stream.abort(); else signal.addEventListener('abort', () => stream.abort(), { once: true });
    let chars = 0;
    stream.on('streamEvent', ev => {
      if (ev.type === 'message_start') on({ stage: stage === 'write' ? 'look' : stage });
      else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') on({ stage, chars: chars += ev.delta.text.length });
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
  let data;
  try { data = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join('')); }
  catch { throw fail(502, 'Claude svarte ikke med gyldig JSON. Prøv igjen.'); }
  console.log(`Husform: ${stage === 'write' ? 'tolkning' : 'rette-runde'} ferdig (${msg.usage.input_tokens + (msg.usage.cache_read_input_tokens || 0)} tokens inn, ${msg.usage.output_tokens} ut).`);
  return { msg, data };
}
// Bilder → kontrollert hus. Finner kontrollen alvorlige feil, får Claude én sjanse til å rette dem.
// Returnerer { house, report: { fixed, problems, guesses }, survey }.
async function analyze(images, on, signal) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch { throw fail(500, 'Pakken @anthropic-ai/sdk mangler på serveren. Kjør npm install.'); }
  const { normalize, inspect } = await HOUSE;
  client ??= new Anthropic({ apiKey: KEY });
  const content = images.flatMap((u, i) => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(u || '');
    if (!m) throw fail(400, `Bilde ${i + 1} er ikke et gyldig bilde.`);
    if (m[2].length * .75 > 5e6) throw fail(413, `Bilde ${i + 1} er for stort (over 5 MB). Last siden på nytt og velg bildene igjen, så krympes de.`);
    return [{ type: 'text', text: `Bilde ${i + 1}:` }, { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }];
  });
  // Bildene caches, så en eventuell rette-runde slipper å lese dem på nytt.
  content.push({ type: 'text', text: `Dette er ${images.length} bilder av huset. Lag modellen.`, cache_control: { type: 'ephemeral' } });
  const messages = [{ role: 'user', content }];
  const check = (data, final) => {
    if (!data?.house) throw fail(502, 'Claude svarte uten noe hus. Prøv igjen.');
    try { return inspect(normalize(data.house), { final }); } catch (e) { throw fail(502, `Claude svarte med et hus som ikke kan brukes: ${e.message} Prøv igjen.`); }
  };
  const serious = r => r.problems.filter(p => p.serious);
  let { msg, data } = await ask(Anthropic, messages, on, signal, 'write');
  on({ stage: 'check' });
  let result = check(data);
  console.log('Husform: befaring', JSON.stringify(data.survey, null, 1));
  if (serious(result).length) {
    console.log('Husform: kontrollen fant', serious(result).map(p => p.text));
    messages.push({ role: 'assistant', content: msg.content }, { role: 'user', content: [{ type: 'text', text: FIX(serious(result)) }] });
    try {
      const again = await ask(Anthropic, messages, on, signal, 'fix'), r2 = check(again.data);
      if (serious(r2).length <= serious(result).length) data = again.data;
      console.log('Husform: etter rette-runden', serious(r2).map(p => p.text));
    } catch (e) { if (signal.aborted) throw e; console.error('Husform: rette-runden feilet, bruker første svar:', e.message); }
    result = check(data, true); // siste kontroll lukker det som fortsatt er åpent, og melder det
  }
  const report = { fixed: result.fixed, problems: result.problems.map(p => p.text), guesses: String(data.survey?.guesses || '') };
  return { house: result.house, report, survey: data.survey };
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
// Etter det strømmes linjer med JSON (NDJSON): { type: 'progress', stage, chars? } og { type: 'beat' } underveis,
// så { type: 'done', house, report, survey } eller { type: 'error', error }. stage: look → write → check → (fix) .
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
    if (p.chars != null) { const t = Date.now(); if (t - last < 400) return; last = t; }
    line({ type: 'progress', ...p });
  };
  try {
    const { images } = await readBody(req);
    if (!KEY) throw fail(503, 'Serveren har ingen API-nøkkel. Legg ANTHROPIC_API_KEY=... i filen .env og start node server.js på nytt.');
    if (!Array.isArray(images) || images.length < 5) throw fail(400, `Velg minst 5 bilder (fikk ${Array.isArray(images) ? images.length : 0}).`);
    if (images.length > 30) throw fail(400, `Du kan sende høyst 30 bilder (fikk ${images.length}).`);
    const done = await analyze(images, on, ac.signal);
    if (started) line({ type: 'done', ...done }); else send(res, 200, done);
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
