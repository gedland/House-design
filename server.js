// Husform-server: serverer appen og POST /api/analyze (bilder → hus-JSON via Claude). Node 18+.
// API-nøkkelen leses fra miljøet eller .env og forlater aldri serveren. Uten nøkkel svarer /api/status {ai:false} og appen viser demohuset.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIALS, FURNITURE, ROOFS, normalize, check } from './js/house.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env', '.env.local']) try {
  for (const l of fs.readFileSync(path.join(__dirname, f), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}
const E = process.env, KEY = E.ANTHROPIC_API_KEY || '', MODEL = E.CLAUDE_MODEL || 'claude-opus-5-5';
const fail = (status, error) => Object.assign(new Error(error), { status });

// Skjemaet Claude må svare i. Det er det samme som øverst i js/house.js, uten id-er (de lages av normalize()). Listene hentes derfra.
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items }), N = { type: 'number' }, T = { type: 'string' }, one = values => ({ type: 'string', enum: values });
const num = description => ({ type: 'number', description });
const COLOR = { type: 'string', description: 'Hex-farge, f.eks. #e9e4d8' }, MAT = one(Object.keys(MATERIALS));
const SCHEMA = obj({
  name: T,
  floors: list(obj({
    name: T, height: num('Etasjehøyde i meter, normalt 2.4'),
    rooms: list(obj({ name: T, x: N, z: N, w: num('Bredde langs x'), d: num('Dybde langs z'), material: MAT, color: COLOR })),
    walls: list(obj({ x1: N, z1: N, x2: N, z2: N, thickness: N, material: MAT, color: COLOR,
      openings: list(obj({ type: one(['door', 'window']), pos: num('Meter fra (x1, z1) til midten av åpningen'), width: N, height: N, sill: num('Høyde fra gulvet til underkanten, 0 for dører'), color: COLOR })) })),
    furniture: list(obj({ type: one(Object.keys(FURNITURE)), x: N, z: N, rot: num('0, 90, 180 eller 270: hvilken vei ryggen vender'), w: N, d: N, h: N, material: MAT, color: COLOR })),
  })),
  roof: obj({ type: one(Object.keys(ROOFS)), pitch: N, overhang: N, material: MAT, color: COLOR }),
});
const PROMPT = `Du får bilder av ett og samme hus, tatt ute og inne med mobil. Du skal bygge en 3D-modell av huset som ett JSON-objekt. Modellen tegnes rett fra JSON-en og åpnes i en editor der eieren retter detaljer etterpå. Eieren skal kjenne igjen huset sitt med en gang: riktig grunnform, riktig antall etasjer, riktig takform, dører og vinduer på riktig vegg og riktige farger. Det er viktigere enn at hvert mål er nøyaktig.

# Slik er modellen bygget opp

Alle mål er i meter. Sett ovenfra går x mot høyre og z mot deg når du står foran inngangsfasaden; y er opp. Husets bakre venstre hjørne ligger i (0, 0), så inngangsfasaden er veggen med størst z, baksiden ligger på z = 0, venstre gavl på x = 0 og høyre gavl på størst x.

- Etasjer listes nedenfra og opp. "height" er etasjehøyden, og veggene tegnes så høye.
- Et rom er et rektangel med hjørnet (x, z), bredde w langs x og dybde d langs z. "material" og "color" er gulvet.
- En vegg er ett rett linjestykke fra (x1, z1) til (x2, z2), langs x eller langs z. Yttervegger har thickness 0.2–0.3 og fasadens materiale og farge. Innervegger har ca. 0.1 og veggfargen inne.
- En åpning (dør eller vindu) ligger i veggen sin. "pos" er avstanden fra veggens startpunkt (x1, z1) til midten av åpningen.
- Et møbel har midtpunktet (x, z) og målene w (bredde) × d (dybde) × h (høyde). "rot" sier hvilken vei ryggen eller baksiden vender: 0 mot baksiden av huset (z = 0), 90 mot høyre (størst x), 180 mot inngangsfasaden, 270 mot venstre (x = 0). Ved 90 og 270 ligger bredden w langs z.
- Taket legges over øverste etasje, med mønet langs den lengste siden av huset.

# Arbeidsmåte

Tenk deg gjennom huset i denne rekkefølgen før du skriver noe. Hvert trinn bygger på det forrige, så ikke gå videre før trinnet henger sammen.

1. Ytre form og grunnflate, fra utebildene. Sorter bildene i ute og inne. Finn ut hvilken fasade hvert utebilde viser, og hvilke bilder som viser samme hjørne fra to sider. Bestem grunnformen: et rektangel, eller en L- eller T-form satt sammen av rektangler (tilbygg, vinkel, utstikkende inngangsparti). Anslå lengden på hver fasade ved å måle mot kjente størrelser i samme bilde, og kontroller at motstående sider blir like lange. En vanlig enebolig er 7–9 m dyp og 9–14 m lang; havner du langt utenfor, mål en gang til.

2. Etasjer og tak. Tell etasjer ut fra vindusrekkene i fasaden, og se etter kjeller eller sokkel og etter loft med vinduer i gavlen. Bestem takformen (saltak "gable", valmtak "hip", flatt tak "flat"), takvinkelen i grader og takutstikket. Siden mønet alltid følger den lengste siden, må lengde og dybde på huset stemme med hvilken vei mønet går på bildene: gavlveggene er de to korte sidene. En etasje under skråtak tas med som egen etasje når bildene viser rom der, med lavere "height" (ca. 2.0) hvis veggene er lave.

3. Rominndeling, fra innebildene. Finn ut hvilket rom hvert innebilde viser, og hvilke bilder som viser samme rom. Plasser rommene i grunnflaten ved hjelp av det som synes både ute og inne: et vindu eller en dør du kjenner igjen fra fasaden, utsikten gjennom vinduet, lyset, hvilken etasje du er i. Bruk døråpninger og gjennomsyn mellom rom til å avgjøre hvilke rom som ligger inntil hverandre. Anslå størrelsen på hvert rom fra møbler og dører i bildet. Del så hele grunnflaten i hver etasje inn i rektangler som ligger kant i kant, uten overlapp og uten tomrom. Et L-formet rom blir to rektangler uten vegg mellom. Rom du ikke har bilde av, men som huset må ha (gang, bad, bod, soverom, trapperom), legger du der det er plass og der de vanligvis ligger. Summen av rommene skal være nøyaktig grunnflaten fra trinn 1, og etasjene skal ligge rett over hverandre.

4. Vegger, så dører og vinduer. Legg ytterveggene som en lukket ring rundt grunnflaten, én vegg per rett side, slik at slutten på én vegg er starten på den neste. Legg en innervegg langs hver kant der to rom møtes, én gang, ikke én per rom. Der bildene viser åpen løsning (for eksempel stue og kjøkken i ett), lar du veggen være. Gå deretter gjennom fasadene én for én og sett vinduer og ytterdører der bildene viser dem, i riktig rekkefølge og med riktig avstand fra hjørnene. Pass på retningen: på et bilde av inngangsfasaden er venstre i bildet liten x. På et bilde av baksiden er venstre i bildet stor x. På et bilde av venstre gavl (x = 0) er venstre i bildet baksiden (liten z), og på høyre gavl er venstre i bildet inngangsfasaden (stor z). Regn alltid "pos" fra veggens startpunkt. Kontroller mot innebildene at hvert vindu havner i veggen til rommet det hører til. Hvert rom skal ha minst én dør eller en åpen overgang til naborommet, første etasje skal ha ytterdøra, og en dør mellom to rom står i veggen de deler. To åpninger i samme vegg kan ikke overlappe, og en åpning må ligge minst 0.1 fra veggens ender og under taket i etasjen.

5. Møbler til slutt. Ta med de store møblene som faktisk synes på bildene, høyst rundt 40. Sett hvert møbel inne i rommet sitt, inntil veggen det står mot på bildet, med ryggen mot veggen og uten å stå i en døråpning. Hele møbelet skal ligge innenfor rommet. Bruk "annet" for det som ikke passer noen type.

# Mål

Du har ingen målestokk, så regn ut alle mål fra ting med kjent størrelse i samme bilde:
- innerdør 0.8–0.9 bred og 2.1 høy, ytterdør ca. 1.0 × 2.1
- etasjehøyde 2.4 (bruk 2.4 hvis ikke bildene tydelig viser noe annet)
- kjøkkenbenk 0.9 høy og 0.6 dyp, hvert benkeskap 0.6 bredt, overskap henger ca. 1.4 over gulvet
- vanlig vindu har underkant ca. 0.9 over gulvet og overkant ca. 2.1, på linje med dørene
- stikkontakter 0.2–0.3 over gulvet, lysbrytere ca. 1.0
- dobbeltseng 1.6–1.8 × 2.0, enkeltseng 0.9 × 2.0, sofa ca. 0.9 dyp og 0.7 per sitteplass, spisestol 0.45 bred
- liggende kledning og mursteinsskift kan telles: et mursteinsskift er ca. 0.075 høyt, et panelbord 0.12–0.15

Eksempel: er ytterdøra 2.1 høy og fasaden ved siden av litt over dobbelt så høy opp til takrenna, er huset i to etasjer. Går det sju dørbredder langs fasaden, er den rundt 7 m.
Rund alle koordinater til nærmeste 0.1, slik at kanter og hjørner som skal møtes, får nøyaktig samme tall.

# Det du ikke ser

Bildene viser aldri hele huset. Anslå resten ut fra det som er vanlig for et hus av denne typen, alderen og størrelsen: en fasade uten bilde får vinduer omtrent som fasaden på motsatt side, et rom uten bilde får normal størrelse, en dør og noen få vanlige møbler. Svaret skal alltid være et helt, lukket hus med gulv i hele grunnflaten, vegger hele veien rundt, tak, ytterdør og dør til hvert rom. La aldri noe stå tomt fordi du er usikker.

# Farger og materialer

Les fargene av bildene som hex-koder. Bruk fargen flaten har i jevnt dagslys, ikke i skygge eller motlys. Yttervegger får fasadens farge og materiale ("panel" for trekledning, "murstein", "betong" for mur og puss). Vindusrammer og dører får fargen de har på bildene. Taket får takets farge og materiale. Gulv får materialet du ser ("tre" for parkett og laminat, "flis", "betong", "tekstil" for teppe).

# Kontroller svaret

Svaret ditt blir kontrollert maskinelt før det tegnes. Gå gjennom dette selv først:
- Ytterveggene danner en lukket ring rundt grunnflaten i hver etasje.
- Rommene i hver etasje dekker hele grunnflaten, ligger innenfor ytterveggene og overlapper ikke.
- Hver åpning ligger innenfor lengden på veggen sin, og vinduene står på den fasaden bildene viser.
- Hvert rom har dør eller åpen overgang, og første etasje har ytterdør.
- Hvert møbel står helt inne i et rom.

Romnavn, etasjenavn og husets navn skal være på norsk (for eksempel "Stue", "1. etasje").`;

// Hvor mye kontrollen måtte gripe inn. Brukes til å velge det beste av to svar.
const score = r => r.problems.length * 3 + r.fixed.length;
const verify = raw => check(normalize(raw));
let client;
async function analyze(images) {
  let Anthropic;
  try { Anthropic = (await import('@anthropic-ai/sdk')).default; } catch { throw fail(500, 'Pakken @anthropic-ai/sdk mangler på serveren. Kjør npm install.'); }
  client ??= new Anthropic({ apiKey: KEY });
  const content = images.map(u => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(u || '');
    if (!m) throw fail(400, 'Ugyldig bilde i forespørselen.');
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });
  content.push({ type: 'text', text: `Dette er ${images.length} bilder av huset. Lag modellen.` });
  const ask = async messages => {
    let msg;
    try {
      // Strømmes fordi svaret kan bli langt. Avviser modellen forespørselen, prøver API-et selv en reservemodell (fallbacks).
      // cache_control gjør at bildene ikke betales fullt to ganger hvis svaret må rettes.
      msg = await client.beta.messages.stream({
        model: MODEL, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', cache_control: { type: 'ephemeral' },
        thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
        system: PROMPT, messages,
      }).finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw fail(401, 'API-nøkkelen ble avvist. Sjekk ANTHROPIC_API_KEY på serveren.');
      if (e instanceof Anthropic.RateLimitError) throw fail(429, 'For mange forespørsler eller brukt opp kvote hos Anthropic. Vent litt og prøv igjen.');
      if (e instanceof Anthropic.NotFoundError) throw fail(502, `Modellen «${MODEL}» finnes ikke. Sjekk CLAUDE_MODEL.`);
      if (e instanceof Anthropic.BadRequestError) throw fail(400, `Forespørselen ble avvist av Claude API: ${e.message}`);
      if (e instanceof Anthropic.APIConnectionError) throw fail(502, 'Serveren fikk ikke kontakt med Claude API. Prøv igjen.');
      if (e instanceof Anthropic.APIError) throw fail(502, `Claude API svarte med feil ${e.status ?? ''}. Prøv igjen om litt.`);
      throw e;
    }
    if (msg.stop_reason === 'refusal') throw fail(422, 'Claude ville ikke tolke disse bildene. Prøv med andre bilder av huset.');
    if (msg.stop_reason === 'max_tokens') throw fail(502, 'Modellen ble for stor til å fullføres. Prøv med færre bilder.');
    try { return { msg, result: verify(JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''))) }; }
    catch { throw fail(502, 'Claude svarte ikke med et gyldig hus. Prøv igjen.'); }
  };
  const first = await ask([{ role: 'user', content }]);
  let best = first.result;
  // Fant kontrollen noe den ikke kunne rette, eller måtte den rette mye, får Claude funnene og ett forsøk på å rette selv ut fra bildene.
  if (best.problems.length || best.fixed.length >= 3) {
    const found = [...best.problems, ...best.fixed].map(t => `- ${t}`).join('\n');
    try {
      const second = await ask([{ role: 'user', content }, { role: 'assistant', content: first.msg.content },
        { role: 'user', content: `Modellen din ble kontrollert, og dette stemte ikke:\n${found}\n\nSe på bildene igjen og rett årsaken til hvert punkt, ikke bare symptomet. Behold alt som var riktig. Svar med hele modellen på nytt.` }]);
      if (score(second.result) < score(best)) best = second.result;
    } catch (e) { console.error('Rettingen feilet, bruker første svar:', e.message); }
  }
  return { house: best.house, report: { fixed: best.fixed, problems: best.problems } };
}

const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const FILES = ['index.html', 'style.css', 'js/app.js', 'js/scene.js', 'js/house.js', 'manifest.json', 'service-worker.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', c => { if ((n += c.length) > 30e6) { no(fail(413, 'Bildene er for store til sammen. Bruk færre bilder.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString())); } catch { no(fail(400, 'Ugyldig forespørsel.')); } });
  req.on('error', no);
});
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/status') return send(res, 200, { ai: !!KEY });
  if (url === '/api/analyze') {
    if (req.method !== 'POST') return send(res, 405, { error: 'Bruk POST.' });
    try {
      if (!KEY) throw fail(503, 'Serveren har ingen API-nøkkel. Sett ANTHROPIC_API_KEY i .env og start serveren på nytt.');
      const { images } = await readBody(req);
      if (!Array.isArray(images) || images.length < 5 || images.length > 30) throw fail(400, 'Send mellom 5 og 30 bilder.');
      send(res, 200, await analyze(images));
    } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Uventet feil på serveren.' }); if (!e.status) console.error(e); }
    return;
  }
  const name = url === '/' ? 'index.html' : url.slice(1);
  if (!FILES.includes(name) || req.method !== 'GET') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ikke funnet'); }
  const type = TYPES[name.split('.').pop()];
  fs.readFile(path.join(__dirname, name), (err, buf) => { res.writeHead(err ? 500 : 200, { 'Content-Type': type + (type.startsWith('image/png') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache' }); res.end(err ? 'Feil' : buf); });
});
const PORT = +E.PORT || 3000, HOST = E.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log(`Husform: http://localhost:${PORT} (${KEY ? `bilder tolkes med ${MODEL} – koster penger per hus` : 'ingen API-nøkkel, bare demohus'})`));
