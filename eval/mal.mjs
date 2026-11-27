// Måler og sammenligner hus: grunnflate, antall etasjer, takform og antall dører og vinduer per fasade.
// Brukes av eval/kjor.mjs. Fasadene følger koordinatene i prompten: forsiden er inngangsfasaden (størst z),
// venstre side ligger ved x = 0 og baksiden ved z = 0, sett utenfra mot inngangen.
import { normalize } from '../js/house.js';

export const FASADER = ['forside', 'hoyre', 'bakside', 'venstre']; // rundt huset med klokken, sett ovenfra
export const NAVN = { forside: 'forside', hoyre: 'høyre side', bakside: 'bakside', venstre: 'venstre side' };
export const TAK = { gable: 'saltak', hip: 'valmtak', flat: 'flatt tak', ingen: 'uten tak' };

const inRoom = (rooms, x, z) => rooms.some(r => x > r.x - .01 && x < r.x + r.w + .01 && z > r.z - .01 && z < r.z + r.d + .01);
// Ligger punktet innenfor ytterveggene? Strålekasting mot veggene, som virker selv når de ikke står i rekkefølge.
const inWalls = (walls, x, z) => walls.reduce((inside, w) => ((w.z1 > z) !== (w.z2 > z) && x < w.x1 + (z - w.z1) / (w.z2 - w.z1) * (w.x2 - w.x1)) ? !inside : inside, false);

// Hvilken fasade en yttervegg tilhører: retningen veggens utside vender mot.
function facade(w, floor, center) {
  const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1), mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
  let nx = (w.z2 - w.z1) / L, nz = -(w.x2 - w.x1) / L; // én av de to normalene
  const ext = floor.walls.filter(v => v.exterior), d = Math.max(.3, w.thickness);
  const inside = (x, z) => floor.rooms.length ? inRoom(floor.rooms, x, z) : inWalls(ext, x, z);
  const a = inside(mx + nx * d, mz + nz * d), b = inside(mx - nx * d, mz - nz * d);
  // Normalen skal peke ut. Er det uklart (ingen rom på noen av sidene), pekes den bort fra midten av huset.
  if (a && !b || a === b && (mx - center[0]) * nx + (mz - center[1]) * nz < 0) { nx = -nx; nz = -nz; }
  return Math.abs(nz) >= Math.abs(nx) ? (nz > 0 ? 'forside' : 'bakside') : (nx > 0 ? 'hoyre' : 'venstre');
}

const empty = () => Object.fromEntries(FASADER.map(f => [f, { dorer: 0, vinduer: 0 }]));
const r1 = v => Math.round(v * 10) / 10;

// Nøkkeltallene for ett hus (rå JSON fra AI, fil eller fasit).
export function measure(raw) {
  const h = normalize(raw);
  const ext = h.floors.flatMap(f => f.walls.filter(w => w.exterior));
  const pts = ext.length ? ext.flatMap(w => [[w.x1, w.z1], [w.x2, w.z2]]) : h.floors.flatMap(f => f.rooms.flatMap(r => [[r.x, r.z], [r.x + r.w, r.z + r.d]]));
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  const bredde = xs.length ? Math.max(...xs) - Math.min(...xs) : 0, dybde = zs.length ? Math.max(...zs) - Math.min(...zs) : 0;
  const areal = Math.max(...h.floors.map(f => f.rooms.reduce((s, r) => s + r.w * r.d, 0))) || bredde * dybde;
  const center = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
  const fasader = empty(), etasjer = h.floors.map(() => empty());
  h.floors.forEach((f, i) => {
    for (const w of f.walls.filter(w => w.exterior)) {
      const side = facade(w, f, center);
      for (const o of w.openings) { const k = o.type === 'door' ? 'dorer' : 'vinduer'; fasader[side][k]++; etasjer[i][side][k]++; }
    }
  });
  return { bredde: r1(bredde), dybde: r1(dybde), areal: r1(areal), etasjer: h.floors.length, tak: h.roof?.type ?? 'ingen', vinkel: h.roof?.pitch ?? null, fasader, perEtasje: etasjer };
}

// Tolkningene av fasadene som modellen kan ha gjort: dreid huset (feil inngangsfasade) og/eller byttet venstre og høyre.
const MAPS = [false, true].flatMap(mirror => [0, 1, 2, 3].map(k => ({ mirror, k })));
const mapped = (m, { mirror, k }) => { // fasit-fasade → modellens fasade
  let i = FASADER.indexOf(m); if (mirror && i % 2) i = 4 - i; return FASADER[(i + k) % 4];
};
function describe({ mirror, k }) {
  if (!k) return 'venstre og høyre side er byttet om (speilvendt)';
  const front = NAVN[mapped('forside', { mirror, k })];
  return `modellens ${front} er husets forside${mirror ? ', og huset er i tillegg speilvendt' : ''} (feil inngangsfasade)`;
}
const pct = (s, f) => f ? r1((s - f) / f * 100) : 0;

// Sammenligner modellens hus med fasiten.
export function compare(fasitRaw, svarRaw) {
  const f = measure(fasitRaw), s = measure(svarRaw);
  const grunnflate = { fasit: { bredde: f.bredde, dybde: f.dybde, areal: f.areal }, svar: { bredde: s.bredde, dybde: s.dybde, areal: s.areal },
    avvik: { bredde: pct(s.bredde, f.bredde), dybde: pct(s.dybde, f.dybde), areal: pct(s.areal, f.areal) } };
  const direct = Math.abs(grunnflate.avvik.bredde) + Math.abs(grunnflate.avvik.dybde), swapped = Math.abs(pct(s.bredde, f.dybde)) + Math.abs(pct(s.dybde, f.bredde));
  grunnflate.byttet = Math.abs(f.bredde - f.dybde) > .5 && direct > 30 && swapped < direct / 2;
  const fasader = {};
  let feil = 0;
  for (const side of FASADER) {
    const a = f.fasader[side], b = s.fasader[side];
    fasader[side] = { fasit: a, svar: b, dorer: b.dorer - a.dorer, vinduer: b.vinduer - a.vinduer };
    feil += Math.abs(b.dorer - a.dorer) + Math.abs(b.vinduer - a.vinduer);
  }
  // Passer fasadene klart bedre når huset dreies eller speilvendes, har modellen trolig forvekslet sidene.
  const err = m => FASADER.reduce((sum, side) => { const a = f.fasader[side], b = s.fasader[mapped(side, m)]; return sum + Math.abs(b.dorer - a.dorer) + Math.abs(b.vinduer - a.vinduer); }, 0);
  // Ved likt antall feil vinner den enkleste forklaringen: bare speilvendt, så dreid 180°, så dreid 90°.
  const order = [{ mirror: true, k: 0 }, { mirror: false, k: 2 }, { mirror: false, k: 1 }, { mirror: false, k: 3 }, ...MAPS.filter(m => m.mirror && m.k)];
  const fits = order.map(m => ({ m, e: err(m) })).sort((p, q) => p.e - q.e), best = fits[0];
  const also = fits.slice(1).filter(x => x.e === best.e).map(x => describe(x.m));
  const rotasjon = best.e + 2 <= feil ? { tekst: [describe(best.m), ...also].join(', eller '), feil: best.e, mirror: best.m.mirror, k: best.m.k } : null;
  return {
    grunnflate,
    etasjer: { fasit: f.etasjer, svar: s.etasjer, ok: f.etasjer === s.etasjer },
    tak: { fasit: f.tak, svar: s.tak, ok: f.tak === s.tak, vinkel: { fasit: f.vinkel, svar: s.vinkel, avvik: f.vinkel != null && s.vinkel != null && f.tak !== 'flat' ? r1(s.vinkel - f.vinkel) : null } },
    fasader, feil, rotasjon,
    perEtasje: { fasit: f.perEtasje, svar: s.perEtasje },
  };
}

// ---------- Rapport ----------
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);
const dim = g => `${g.bredde} × ${g.dybde} m`;
export function row(id, c) {
  const g = c.grunnflate, cell = side => { const x = c.fasader[side]; return `${x.fasit.dorer}/${x.fasit.vinduer} → ${x.svar.dorer}/${x.svar.vinduer}${x.dorer || x.vinduer ? ' ✗' : ''}`; };
  return `| ${id} | ${dim(g.fasit)} → ${dim(g.svar)} (areal ${sign(g.avvik.areal)} %)${g.byttet ? ' byttet' : ''} | ${c.etasjer.fasit} → ${c.etasjer.svar}${c.etasjer.ok ? '' : ' ✗'} | ${TAK[c.tak.fasit]} → ${TAK[c.tak.svar]}${c.tak.ok ? '' : ' ✗'}${c.tak.vinkel.avvik != null ? ` (${sign(c.tak.vinkel.avvik)}°)` : ''} | ${FASADER.map(cell).join(' | ')} |`;
}
export const HEAD = `| Hus | Grunnflate, fasit → modell | Etasjer | Tak | Forside | Høyre | Bakside | Venstre |\n|---|---|---|---|---|---|---|---|`;

// Oppsummerer alle sammenligningene og foreslår endringer i prompten (PROMPT i server.js) ut fra avvikene som går igjen.
// runs = [{ id, c }] der c er fra compare(). Returnerer { tall, forslag: [{ tittel, avvik, hvor, tekst }] }.
export function suggest(runs) {
  const n = runs.length, out = [];
  if (!n) return { tall: {}, forslag: [] };
  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1), hus = list => [...new Set(list.map(r => r.id))].join(', ');
  const areal = runs.map(r => r.c.grunnflate.avvik.areal), arealMean = r1(mean(areal)), arealAbs = r1(mean(areal.map(Math.abs)));
  const tall = { kjoringer: n, areal: { snitt: arealMean, snittAbs: arealAbs }, etasjerRiktig: runs.filter(r => r.c.etasjer.ok).length, takRiktig: runs.filter(r => r.c.tak.ok).length,
    fasadefeil: r1(mean(runs.map(r => r.c.feil))), fasader: {} };

  const small = runs.filter(r => r.c.grunnflate.avvik.areal <= -10), big = runs.filter(r => r.c.grunnflate.avvik.areal >= 10);
  if (small.length >= Math.max(1, n / 2) && arealMean <= -8) out.push({ tittel: 'Husene blir for små', hvor: '# Mål',
    avvik: `Grunnflaten er i snitt ${sign(arealMean)} % for liten (${small.length} av ${n} kjøringer minst 10 % under: ${hus(small)}).`,
    tekst: 'Regn ut lengden på hver fasade fra flere kjente størrelser, ikke bare fra døren. Tell vinduene og mellomrommene: et vindu i stue og soverom er ca. 1.0–1.4 m bredt, veggen mellom to vinduer er sjelden under 1 m, og det er minst 0.5 m fra hjørnet til første vindu. Sammenlign med høyden: én etasje er ca. 2.7 m på fasaden, så en fasade som er tre ganger så lang som én etasje er høy, er ca. 8 m. Velg den største av lengdene du kommer frem til hvis de spriker.' });
  if (big.length >= Math.max(1, n / 2) && arealMean >= 8) out.push({ tittel: 'Husene blir for store', hvor: '# Mål',
    avvik: `Grunnflaten er i snitt ${sign(arealMean)} % for stor (${big.length} av ${n} kjøringer minst 10 % over: ${hus(big)}).`,
    tekst: 'Mål fasaden på veggen, ikke på takfoten: takutstikket (0.3–0.6 m på hver side) er ikke med i lengden. Veggene i JSON går langs midtlinjen av ytterveggen. Kontroller lengden mot døren: en ytterdør er ca. 1 m bred, så tell hvor mange dørbredder fasaden er.' });
  const swapped = runs.filter(r => r.c.grunnflate.byttet);
  if (swapped.length) out.push({ tittel: 'Lengde og bredde byttet', hvor: '# Koordinater',
    avvik: `Bredde og dybde er byttet om i ${swapped.length} av ${n} kjøringer (${hus(swapped)}).`,
    tekst: 'Bredden langs x er lengden på inngangsfasaden. Dybden langs z er lengden på sidene (gavlene). Skriv begge i survey.exterior som «inngangsfasaden er … m, sidene er … m» før du lager veggene, og bruk dem slik.' });

  const under = runs.filter(r => r.c.etasjer.svar < r.c.etasjer.fasit), over = runs.filter(r => r.c.etasjer.svar > r.c.etasjer.fasit);
  if (under.length) out.push({ tittel: 'Etasjer mangler', hvor: '# Arbeidsrekkefølge, punkt 3',
    avvik: `For få etasjer i ${under.length} av ${n} kjøringer (${under.map(r => `${r.id}: ${r.c.etasjer.fasit} → ${r.c.etasjer.svar}`).join(', ')}).`,
    tekst: 'Tell vindusradene på gavlen, ikke bare på langsiden. Et vindu i gavltrekanten over vinduene i 1. etasje betyr en loftsetasje med rom, og den skal være med som egen etasje med lav vegghøyde (knevegg ca. 1.0–1.6 m), selv om langsidene bare viser én rad med vinduer.' });
  if (over.length) out.push({ tittel: 'For mange etasjer', hvor: '# Arbeidsrekkefølge, punkt 3',
    avvik: `For mange etasjer i ${over.length} av ${n} kjøringer (${over.map(r => `${r.id}: ${r.c.etasjer.fasit} → ${r.c.etasjer.svar}`).join(', ')}).`,
    tekst: 'Tell bare etasjer som har vinduer eller dører på fasadene. En høy gavl eller et bratt tak uten vinduer i gavlen er et kaldt loft, ikke en etasje.' });

  const ROOF = {
    'gable>hip': 'Saltak har to takflater og loddrette, trekantede gavlvegger på kortsidene. Ser du en trekantet veggflate under taket på en side, er det saltak, ikke valmtak.',
    'hip>gable': 'Valmtak har fire takflater som skrår ned mot alle fire veggene, og ingen trekantet gavlvegg: takfoten går rundt hele huset i samme høyde, og kortsidene viser en takflate formet som en trekant, ikke en vegg.',
    'flat>gable': 'Flatt tak: fra bakken synes ingen takflate, bare en rett avslutning (gesims eller beslag) øverst på veggen, og alle fire fasader er rektangulære. Velg da "flat".',
    'flat>hip': 'Flatt tak: fra bakken synes ingen takflate, bare en rett avslutning (gesims eller beslag) øverst på veggen, og alle fire fasader er rektangulære. Velg da "flat".',
    'gable>flat': 'Velg "flat" bare når ingen av bildene viser en skrå takflate. Synes en trekantet gavl på noen av sidene, er det saltak.',
    'hip>flat': 'Velg "flat" bare når ingen av bildene viser en skrå takflate. Skrår taket ned mot alle fire sider, er det valmtak.',
  };
  const wrongRoof = runs.filter(r => !r.c.tak.ok);
  const pairs = {};
  for (const r of wrongRoof) (pairs[`${r.c.tak.fasit}>${r.c.tak.svar}`] ??= []).push(r);
  for (const [k, list] of Object.entries(pairs)) {
    const [a, b] = k.split('>');
    out.push({ tittel: `${TAK[a][0].toUpperCase() + TAK[a].slice(1)} tolket som ${TAK[b]}`, hvor: '# Formatet, punktet om tak',
      avvik: `${list.length} av ${n} kjøringer (${hus(list)}).`, tekst: ROOF[k] || `Beskriv i survey.floors_and_roof hva som skiller ${TAK[a]} fra ${TAK[b]} på bildene før du velger.` });
  }
  const pitch = runs.map(r => r.c.tak.vinkel.avvik).filter(v => v != null);
  if (pitch.length && mean(pitch.map(Math.abs)) > 7) out.push({ tittel: 'Takvinkelen bommer', hvor: '# Arbeidsrekkefølge, punkt 3',
    avvik: `Takvinkelen avviker i snitt ${r1(mean(pitch.map(Math.abs)))}° (${sign(r1(mean(pitch)))}° med fortegn).`,
    tekst: 'Mål takvinkelen på bildet som viser gavlen rett forfra: høyden på gavltrekanten delt på halve bredden av gavlen. 1:2 er ca. 27°, 3:4 ca. 37°, 1:1 er 45°. Bilder tatt på skrå gjør taket slakere enn det er.' });

  for (const side of FASADER) {
    const d = runs.map(r => r.c.fasader[side].dorer), v = runs.map(r => r.c.fasader[side].vinduer);
    tall.fasader[side] = { dorer: r1(mean(d)), vinduer: r1(mean(v)) };
  }
  const missW = FASADER.filter(s => tall.fasader[s].vinduer <= -.5), extraW = FASADER.filter(s => tall.fasader[s].vinduer >= .5);
  const missD = FASADER.filter(s => tall.fasader[s].dorer <= -.25), extraD = FASADER.filter(s => tall.fasader[s].dorer >= .25);
  const list = (sides, k) => sides.map(s => `${NAVN[s]} ${sign(tall.fasader[s][k])}`).join(', ');
  if (missW.length) out.push({ tittel: 'Vinduer mangler', hvor: '# Arbeidsrekkefølge, punkt 5',
    avvik: `Snitt per hus: ${list(missW, 'vinduer')} vinduer.`,
    tekst: `Tell vinduene på hver fasade for seg, på bildet som viser den fasaden mest rett forfra, og skriv antallet per etasje i survey.openings, for eksempel «bakside: 1. etasje 2 vinduer og 1 dør, 2. etasje 3 vinduer». Små vinduer (bad, bod, gang) teller også. Lag så veggene med nøyaktig de åpningene du har skrevet, og sjekk etterpå at hver yttervegg har like mange vinduer som i survey.${missW.some(s => s !== 'forside') ? ' Fasader som bare ses på skrå, telles fra det skrå bildet.' : ''}` });
  if (extraW.length) out.push({ tittel: 'For mange vinduer', hvor: '# Arbeidsrekkefølge, punkt 5',
    avvik: `Snitt per hus: ${list(extraW, 'vinduer')} vinduer.`,
    tekst: 'Et vindu du ser innenfra, er et av vinduene du allerede har talt utenfra, ikke et nytt. Legg ikke til vinduer for rom du har anslått på en fasade som synes i bildene: der er antallet du talte, fasit.' });
  if (missD.length) out.push({ tittel: 'Dører mangler', hvor: '# Arbeidsrekkefølge, punkt 5',
    avvik: `Snitt per hus: ${list(missD, 'dorer')} dører.`,
    tekst: 'Se etter dører på alle fasadene, ikke bare hoveddøren. Mange hus har en dør til hage eller terrasse på baksiden eller gavlen. En åpning som går helt ned til bakken, er en dør, også når den har glass.' });
  if (extraD.length) out.push({ tittel: 'For mange ytterdører', hvor: '# Arbeidsrekkefølge, punkt 5',
    avvik: `Snitt per hus: ${list(extraD, 'dorer')} dører.`,
    tekst: 'Legg bare til ytterdører du ser på bildene. Et vindu med lav brystning er fortsatt et vindu. Rom uten egen ytterdør nås gjennom en innerdør.' });

  const rot = runs.filter(r => r.c.rotasjon);
  if (rot.length) out.push({ tittel: 'Fasadene forvekslet', hvor: '# Koordinater',
    avvik: `Dørene og vinduene passer bedre når huset dreies eller speilvendes i ${rot.length} av ${n} kjøringer: ${rot.map(r => `${r.id}: ${r.c.rotasjon.tekst}`).join('; ')}.`,
    tekst: 'Venstre og høyre gjelder sett utenfra, når du står foran inngangsfasaden og ser på den. Skriv for hvert utebilde i survey.photos hvilken fasade det viser, og hvilken fasade som synes til venstre og til høyre for den på bildet hvis det er tatt på skrå. Venstre side ligger ved x = 0, høyre side ved største x.' });
  return { tall, forslag: out };
}
