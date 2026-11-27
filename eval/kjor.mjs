// Eval av tolkningen: kjører analyze() fra server.js på bildene av hvert hus i eval/hus/ og sammenligner modellen med
// fasiten: grunnflate, antall etasjer, takform og antall dører og vinduer per fasade. Skriver svarene og en rapport med
// forslag til endringer i prompten til eval/resultater/<tidspunkt>/.
//
//   node eval/kjor.mjs                      alle husene, én gang hver (koster penger: ett eller to Claude-kall per hus)
//   node eval/kjor.mjs rodt-saltak --ganger 3   ett hus, tre ganger (svarene varierer fra gang til gang)
//   node eval/kjor.mjs --samtidig 2         to hus om gangen
//   node eval/kjor.mjs --svar eval/resultater/<tidspunkt>   sammenlign lagrede svar på nytt, uten Claude
//   node eval/kjor.mjs --selvtest           sjekk sammenligningen mot fasiten selv, uten Claude
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';
import { compare, suggest, row, HEAD, FASADER, NAVN } from './mal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), HUS = path.join(ROOT, 'eval', 'hus');
const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const times = Math.max(1, +flag('--ganger') || 1), parallel = Math.max(1, +flag('--samtidig') || 1), saved = flag('--svar'), selftest = flag('--selvtest');
const want = args.filter(a => !a.startsWith('--'));
const ids = fs.readdirSync(HUS).filter(id => fs.existsSync(path.join(HUS, id, 'fasit.json')) && (!want.length || want.includes(id))).sort();
if (!ids.length) { console.error(`Fant ingen hus${want.length ? ` som heter ${want.join(', ')}` : ''} i eval/hus/.`); process.exit(1); }
const fasit = id => JSON.parse(fs.readFileSync(path.join(HUS, id, 'fasit.json'), 'utf8'));
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const images = id => {
  const dir = path.join(HUS, id, 'bilder');
  return fs.readdirSync(dir).filter(f => MIME[f.split('.').pop().toLowerCase()]).sort()
    .map(f => `data:${MIME[f.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`);
};

// ---------- Selvtest: fasiten mot seg selv skal gi null avvik, og et speilvendt hus skal oppdages. ----------
if (selftest) {
  let ok = true;
  for (const id of ids) {
    const f = fasit(id), c = compare(f, f);
    const same = c.feil === 0 && c.etasjer.ok && c.tak.ok && !c.grunnflate.avvik.areal && !c.rotasjon;
    const W = Math.max(...f.floors.flatMap(fl => fl.walls.flatMap(w => [w.x1, w.x2])));
    const mirror = JSON.parse(JSON.stringify(f));
    for (const fl of mirror.floors) {
      for (const r of fl.rooms) r.x = W - r.x - r.w;
      for (const w of fl.walls) { [w.x1, w.x2] = [W - w.x1, W - w.x2]; }
      for (const m of fl.furniture) m.x = W - m.x;
    }
    // Speilvendingen kan bare oppdages når høyre og venstre side har ulikt antall dører eller vinduer.
    const m = compare(f, mirror), { hoyre: h, venstre: v } = c.fasader, lr = h.fasit.vinduer !== v.fasit.vinduer || h.fasit.dorer !== v.fasit.dorer;
    const found = !lr || m.rotasjon?.mirror;
    console.log(`${same && found ? 'OK  ' : 'FEIL'} ${id}: mot seg selv ${same ? 'ingen avvik' : JSON.stringify(c)}; speilvendt ${lr ? (found ? 'oppdaget' : 'ikke oppdaget') : 'kan ikke skilles (like sider)'}`);
    console.log(`     ${FASADER.map(s => `${NAVN[s]} ${c.fasader[s].fasit.dorer} dører/${c.fasader[s].fasit.vinduer} vinduer`).join(', ')}`);
    ok &&= same && found;
  }
  process.exit(ok ? 0 : 1);
}

// ---------- Hent svar: lagrede, eller nye fra Claude. ----------
const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
const outDir = saved ? path.resolve(saved) : path.join(ROOT, 'eval', 'resultater', stamp);
const runs = [];
if (saved) {
  for (const id of ids) for (const f of fs.readdirSync(outDir).filter(f => f === `${id}.json` || new RegExp(`^${id}-\\d+\\.json$`).test(f)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
    runs.push({ id, fil: f, svar: d, c: compare(fasit(id), d.house ?? d) });
  }
  if (!runs.length) { console.error(`Fant ingen lagrede svar for ${ids.join(', ')} i ${outDir}.`); process.exit(1); }
} else {
  const require = createRequire(import.meta.url);
  const server = require('../server.js');
  if (!server.hasKey) { console.error('Ingen API-nøkkel. Legg ANTHROPIC_API_KEY=... i .env (som for node server.js), eller sammenlign lagrede svar med --svar <mappe>.'); process.exit(1); }
  const missing = ids.filter(id => !fs.existsSync(path.join(HUS, id, 'bilder')));
  if (missing.length) { console.error(`Mangler bilder for ${missing.join(', ')}. Kjør node eval/tegn.mjs først.`); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  // Loggen fra analyze() (befaring, kontroll, rette-runde) samles per kjøring i stedet for å blandes i terminalen.
  const als = new AsyncLocalStorage(), { log, error } = console;
  console.log = (...a) => { const s = als.getStore(); s ? s.push(a.map(String).join(' ')) : log(...a); };
  console.error = (...a) => { const s = als.getStore(); s ? s.push('FEIL: ' + a.map(String).join(' ')) : error(...a); };
  const jobs = ids.flatMap(id => Array.from({ length: times }, (_, k) => ({ id, fil: times > 1 ? `${id}-${k + 1}.json` : `${id}.json` })));
  log(`Kjører ${jobs.length} tolkning${jobs.length > 1 ? 'er' : ''} med ${server.MODEL}. Det koster penger hos Anthropic. Svar lagres i ${path.relative(ROOT, outDir)}/`);
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    for (let job; (job = queue.shift());) {
      const logg = [], t0 = Date.now();
      try {
        const res = await als.run(logg, () => server.analyze(images(job.id), () => {}, new AbortController().signal));
        const d = { hus: job.id, sekunder: Math.round((Date.now() - t0) / 1000), ...res, logg };
        fs.writeFileSync(path.join(outDir, job.fil), JSON.stringify(d, null, 1) + '\n');
        const r = { ...job, svar: d, c: compare(fasit(job.id), d.house) }; runs.push(r);
        log(`${job.fil}: ferdig på ${d.sekunder} s. Etasjer ${r.c.etasjer.fasit} → ${r.c.etasjer.svar}, tak ${r.c.tak.fasit} → ${r.c.tak.svar}, areal ${r.c.grunnflate.avvik.areal} %, ${r.c.feil} feil i dører/vinduer.`);
      } catch (e) {
        log(`${job.fil}: feilet: ${e.message}`);
        fs.writeFileSync(path.join(outDir, job.fil.replace('.json', '.feil.txt')), `${e.stack || e.message}\n\n${logg.join('\n')}\n`);
      }
    }
  }));
  console.log = log; console.error = error;
  if (!runs.length) { console.error('Ingen tolkninger lyktes, så det er ingenting å sammenligne.'); process.exit(1); }
}

// ---------- Rapport ----------
runs.sort((a, b) => a.fil.localeCompare(b.fil));
const { tall, forslag } = suggest(runs);
const lines = [
  `# Eval av tolkningen, ${saved ? path.basename(outDir) : stamp}`, '',
  `${runs.length} kjøringer av ${new Set(runs.map(r => r.id)).size} hus. Dører/vinduer per fasade står som «fasit → modell», for eksempel 1/3 → 1/2 (1 dør og 3 vinduer, modellen fikk 1 dør og 2 vinduer).`, '',
  HEAD, ...runs.map(r => row(r.fil.replace('.json', ''), r.c)), '',
  '## Samlet', '',
  `- Etasjer riktig: ${tall.etasjerRiktig} av ${tall.kjoringer}`,
  `- Takform riktig: ${tall.takRiktig} av ${tall.kjoringer}`,
  `- Grunnflate: snittavvik ${tall.areal.snittAbs} % (${tall.areal.snitt > 0 ? '+' : ''}${tall.areal.snitt} % med fortegn)`,
  `- Dører og vinduer: ${tall.fasadefeil} feil per hus i snitt. Snitt per fasade, modell minus fasit: ${FASADER.map(s => `${NAVN[s]} ${tall.fasader[s].dorer} dører / ${tall.fasader[s].vinduer} vinduer`).join(', ')}`,
  ...runs.filter(r => r.c.rotasjon).map(r => `- ${r.fil.replace('.json', '')}: ${r.c.feil} feil i dører og vinduer slik modellen står, ${r.c.rotasjon.feil} hvis sidene byttes. Trolig ${r.c.rotasjon.tekst}.`),
  '', '## Forslag til endringer i prompten (PROMPT i server.js)', '',
  ...(forslag.length ? forslag.flatMap((f, i) => [`### ${i + 1}. ${f.tittel}`, '', `**Avvik:** ${f.avvik}`, '', `**Hvor:** ${f.hvor}`, '', `**Forslag:** ${f.tekst}`, '']) : ['Ingen avvik går igjen nok til å foreslå endringer.', '']),
  '## Befaringen', '', 'Hva modellen skrev om etasjer, tak og åpninger. Avvikene over forklares ofte her.', '',
  ...runs.filter(r => r.svar.survey).flatMap(r => [`### ${r.fil.replace('.json', '')}`, '', `- Etasjer og tak: ${r.svar.survey.floors_and_roof}`, `- Ytre form: ${r.svar.survey.exterior}`, `- Åpninger: ${r.svar.survey.openings}`, '']),
];
const report = lines.join('\n');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'rapport.md'), report);
console.log(report.split('\n## Befaringen')[0]);
console.log(`Rapporten ligger i ${path.relative(ROOT, path.join(outDir, 'rapport.md'))}`);
