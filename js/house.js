// Husets JSON-skjema (versjon 1). Alle mål i meter, y er opp. Dette er det eneste formatet appen leser og skriver.
// {
//   version: 1, name,
//   floors: [{ id, name, height,
//     rooms:     [{ id, name, x, z, w, d, material, color }],            // x,z = hjørne, w = bredde (x), d = dybde (z); materiale/farge gjelder gulvet
//     walls:     [{ id, x1, z1, x2, z2, thickness, exterior, material, color,   // (x1,z1)–(x2,z2) = midtlinjen; exterior = yttervegg
//                   openings: [{ id, type: 'door'|'window', pos, width, height, sill, material, color }] }],  // pos = senter, målt fra (x1,z1); materiale = dørblad/karm
//     furniture: [{ id, type, x, z, rot, w, d, h, material, color }]     // x,z = senter; rot i grader: 0 = baksiden mot −z, 90 = mot −x, 180 = mot +z, −90 = mot +x
//   }],                                                                 // height = gulv til gulv (øverste etasje: vegghøyde opp til takfoten)
//   roof: { type: 'gable'|'hip'|'flat', pitch, overhang, material, color } | null
// }
export const MATERIALS = {
  maling: { label: 'Maling', rough: .9 }, tre: { label: 'Tre', rough: .7 }, panel: { label: 'Trepanel', rough: .8 },
  betong: { label: 'Betong', rough: .95 }, flis: { label: 'Flis', rough: .35 }, murstein: { label: 'Murstein', rough: .9 },
  tekstil: { label: 'Tekstil', rough: 1 }, metall: { label: 'Metall', rough: .35, metal: .8 }, takstein: { label: 'Takstein', rough: .8 },
};
export const FURNITURE = {
  sofa: { label: 'Sofa', w: 2.1, d: .9, h: .8, material: 'tekstil', color: '#7d8a80' },
  bord: { label: 'Bord', w: 1.2, d: .7, h: .45, material: 'tre', color: '#b08a5e' },
  stol: { label: 'Stol', w: .5, d: .5, h: .9, material: 'tre', color: '#8c6a48' },
  seng: { label: 'Seng', w: 1.6, d: 2, h: .9, material: 'tekstil', color: '#c9c3b6' },
  skap: { label: 'Skap', w: 1, d: .45, h: 1.9, material: 'tre', color: '#e6e1d6' },
  kjokken: { label: 'Kjøkkenbenk', w: 2.4, d: .6, h: .9, material: 'tre', color: '#e6e1d6' },
  tv: { label: 'TV-benk', w: 1.6, d: .4, h: 1.2, material: 'tre', color: '#6b5a48' },
  toalett: { label: 'Toalett', w: .4, d: .65, h: .8, material: 'flis', color: '#f4f2ee' },
  vask: { label: 'Servant', w: .8, d: .45, h: .85, material: 'tre', color: '#e6e1d6' },
  dusj: { label: 'Dusj', w: .9, d: .9, h: 2, material: 'flis', color: '#dfe6e8' },
  lampe: { label: 'Lampe', w: .4, d: .4, h: 1.6, material: 'metall', color: '#d9c9a3' },
  plante: { label: 'Plante', w: .5, d: .5, h: 1.2, material: 'maling', color: '#4f7a4c' },
  annet: { label: 'Annet', w: .8, d: .8, h: .8, material: 'maling', color: '#b9b4a8' },
};
export const OPENINGS = { door: { label: 'Dør', width: .9, height: 2.1, sill: 0, material: 'tre', color: '#5a3b26' }, window: { label: 'Vindu', width: 1.2, height: 1.2, sill: .9, material: 'maling', color: '#f2efe8' } };
export const ROOFS = { gable: 'Saltak', hip: 'Valmtak', flat: 'Flatt tak' };
export const uid = p => p + Math.random().toString(36).slice(2, 8);
export const round = v => Math.round(v * 1000) / 1000;

const P = '#e9e4d8', I = '#f1eee7', WF = '#f2efe8';
const win = (pos, width = 1.2, height = 1.2, sill = .9) => ({ type: 'window', pos, width, height, sill, color: WF });
const door = (pos, color = '#efece6') => ({ type: 'door', pos, width: .9, height: 2.1, sill: 0, color });
const outer = (x1, z1, x2, z2, openings) => ({ x1, z1, x2, z2, thickness: .2, exterior: true, material: 'panel', color: P, openings });
const inner = (x1, z1, x2, z2, openings) => ({ x1, z1, x2, z2, thickness: .1, exterior: false, material: 'maling', color: I, openings });
const item = (type, x, z, rot = 0, o = {}) => ({ ...FURNITURE[type], label: undefined, type, x, z, rot, ...o });
const DEMO_RAW = {
  version: 1, name: 'Demohus',
  floors: [{
    name: '1. etasje', height: 2.4,
    rooms: [
      { name: 'Stue', x: 0, z: 0, w: 5.5, d: 4, material: 'tre', color: '#c8a57a' },
      { name: 'Kjøkken', x: 5.5, z: 0, w: 3.5, d: 4, material: 'tre', color: '#c8a57a' },
      { name: 'Bad', x: 0, z: 4, w: 3, d: 3, material: 'flis', color: '#aeb4b5' },
      { name: 'Gang', x: 3, z: 4, w: 2.5, d: 3, material: 'flis', color: '#8d8a84' },
      { name: 'Soverom', x: 5.5, z: 4, w: 3.5, d: 3, material: 'tre', color: '#c8a57a' },
    ],
    walls: [
      outer(0, 7, 9, 7, [win(1.5, .6, .6, 1.4), door(4.25, '#5a3b26'), win(7.25, 1.4)]),
      outer(9, 7, 9, 0, [win(1.5), win(5, 1.2, 1, 1.1)]),
      outer(9, 0, 0, 0, [win(1.75, 1.2, 1, 1.1), win(6.25, 2.4, 1.5, .6)]),
      outer(0, 0, 0, 7, [win(2, 1.4)]),
      inner(0, 4, 9, 4, [door(4.25)]),
      inner(3, 4, 3, 7, [door(1.5)]),
      inner(5.5, 4, 5.5, 7, [door(1.5)]),
      inner(5.5, 0, 5.5, 4, [door(2.9)]),
    ],
    furniture: [
      item('sofa', 2.75, 3.4, 180), item('bord', 2.75, 2.2), item('tv', 2.75, .35), item('plante', .5, .5), item('lampe', 5, 3.5),
      item('kjokken', 7.4, .45, 0, { w: 2.8 }), item('bord', 7.4, 2.6, 0, { w: 1.4, d: .8, h: .75 }), item('stol', 6.4, 2.6, 90), item('stol', 8.4, 2.6, -90),
      item('seng', 7.9, 5.6, -90), item('skap', 5.85, 6.2, 90, { w: 1.2 }),
      item('toalett', .5, 6.4, 90), item('vask', 1.6, 4.35), item('dusj', 2.45, 6.45),
      item('skap', 5.2, 6.2, -90, { w: 1.2, d: .4 }),
    ],
  }],
  roof: { type: 'gable', pitch: 30, overhang: .4, material: 'takstein', color: '#3a3a3c' },
};

// Gjør et hvilket som helst hus-objekt (fra AI, fil eller lagring) gyldig: fyller inn id-er og standarder, og holder tallene innenfor rimelige grenser.
export function normalize(h) {
  const seen = new Set();
  const id = (o, p) => { const v = typeof o.id === 'string' && o.id && !seen.has(o.id) ? o.id : uid(p); seen.add(v); return v; };
  const n = (v, d, min = -500, max = 500) => Math.min(max, Math.max(min, v !== null && v !== '' && isFinite(+v) ? round(+v) : d));
  const col = (c, d) => /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d, mt = (v, d) => MATERIALS[v] ? v : d, arr = a => Array.isArray(a) ? a : [];
  const floors = arr(h?.floors).slice(0, 5).map((f, i) => ({
    id: id(f, 'f'), name: String(f.name || `${i + 1}. etasje`).slice(0, 40), height: n(f.height, 2.4, 1, 6),
    rooms: arr(f.rooms).map(r => ({ id: id(r, 'r'), name: String(r.name || 'Rom').slice(0, 40), x: n(r.x, 0), z: n(r.z, 0), w: n(r.w, 3, .5, 60), d: n(r.d, 3, .5, 60), material: mt(r.material, 'tre'), color: col(r.color, '#c8a57a') })),
    walls: arr(f.walls).map(w => ({ id: id(w, 'w'), x1: n(w.x1, 0), z1: n(w.z1, 0), x2: n(w.x2, 0), z2: n(w.z2, 0), thickness: n(w.thickness, .15, .05, .6), exterior: typeof w.exterior === 'boolean' ? w.exterior : +w.thickness >= .15, material: mt(w.material, 'maling'), color: col(w.color, P),
      openings: arr(w.openings).map(o => { const t = o.type === 'door' ? 'door' : 'window', d = OPENINGS[t]; return { id: id(o, 'o'), type: t, pos: n(o.pos, 1, 0, 200), width: n(o.width, d.width, .3, 12), height: n(o.height, d.height, .3, 5), sill: n(o.sill, d.sill, 0, 5), material: mt(o.material, d.material), color: col(o.color, d.color) }; }) }))
      .filter(w => Math.hypot(w.x2 - w.x1, w.z2 - w.z1) >= .1),
    furniture: arr(f.furniture).map(m => { const t = FURNITURE[m.type] ? m.type : 'annet', d = FURNITURE[t]; return { id: id(m, 'm'), type: t, x: n(m.x, 0), z: n(m.z, 0), rot: n(m.rot, 0, -360, 360), w: n(m.w, d.w, .1, 12), d: n(m.d, d.d, .1, 12), h: n(m.h, d.h, .1, 5), material: mt(m.material, d.material), color: col(m.color, d.color) }; }),
  }));
  if (!floors.length) throw new Error('Modellen inneholder ingen etasjer.');
  const r = h.roof;
  return { version: 1, name: String(h.name || 'Huset mitt').slice(0, 60), floors,
    roof: r && typeof r === 'object' ? { type: ROOFS[r.type] ? r.type : 'gable', pitch: n(r.pitch, 30, 5, 60), overhang: n(r.overhang, .4, 0, 2), material: mt(r.material, 'takstein'), color: col(r.color, '#3a3a3c') } : null };
}
export const DEMO = normalize(DEMO_RAW);

// Finner et objekt i huset ut fra id, med listen det ligger i. y = høyden etasjen står på.
export function find(house, id) {
  if (id === 'roof') return house.roof ? { kind: 'roof', item: house.roof, y: house.floors.reduce((s, f) => s + f.height, 0) } : null;
  let y = 0;
  for (const [index, floor] of house.floors.entries()) {
    for (const [key, kind] of [['rooms', 'room'], ['walls', 'wall'], ['furniture', 'furniture']]) {
      const item = floor[key].find(o => o.id === id);
      if (item) return { kind, item, list: floor[key], floor, index, y };
    }
    for (const wall of floor.walls) {
      const item = wall.openings.find(o => o.id === id);
      if (item) return { kind: 'opening', item, list: wall.openings, floor, index, wall, y };
    }
    y += floor.height;
  }
  return null;
}
export const wallLength = w => Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
export const wallAngle = w => Math.round(Math.atan2(w.z2 - w.z1, w.x2 - w.x1) * 180 / Math.PI);
// Endrer lengde og/eller retning på en vegg. Startpunktet (x1,z1) står stille.
export function setWall(w, len, deg) {
  const L = Math.max(.2, len), a = deg * Math.PI / 180;
  w.x2 = round(w.x1 + Math.cos(a) * L); w.z2 = round(w.z1 + Math.sin(a) * L);
}
// Ytterkanten av en etasje (vegger og rom), eller null når etasjen er tom.
export function bounds(floor) {
  const xs = [], zs = [];
  for (const w of floor.walls) { xs.push(w.x1, w.x2); zs.push(w.z1, w.z2); }
  for (const r of floor.rooms) { xs.push(r.x, r.x + r.w); zs.push(r.z, r.z + r.d); }
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } : null;
}
// Flytter eller endrer størrelse på et rom. Vegger og møbler som hører til rommet følger med.
export function reshapeRoom(floor, room, next) {
  const o = { x: room.x, z: room.z, w: room.w, d: room.d }, n = { ...o, ...next }, e = .03;
  n.w = Math.max(.5, n.w); n.d = Math.max(.5, n.d);
  const inside = (x, z, m) => x >= o.x - m && x <= o.x + o.w + m && z >= o.z - m && z <= o.z + o.d + m;
  const map = (v, a, len, na, nlen) => round(Math.abs(v - a) < e ? na : Math.abs(v - a - len) < e ? na + nlen : na + (v - a) * nlen / len);
  for (const w of floor.walls) for (const k of [1, 2]) if (inside(w['x' + k], w['z' + k], e)) {
    w['x' + k] = map(w['x' + k], o.x, o.w, n.x, n.w); w['z' + k] = map(w['z' + k], o.z, o.d, n.z, n.d);
  }
  for (const f of floor.furniture) if (inside(f.x, f.z, 0)) { f.x = map(f.x, o.x, o.w, n.x, n.w); f.z = map(f.z, o.z, o.d, n.z, n.d); }
  Object.assign(room, { x: round(n.x), z: round(n.z), w: round(n.w), d: round(n.d) });
}

// ---------------------------------------------------------------------------------------------
// Kontroll før tegning. Brukes på hus som Claude har tolket. Retter det som trygt kan rettes og melder resten,
// så ingenting tegnes feil uten at brukeren får vite det. Returnerer { house, fixed: [tekst], problems: [{ text, serious }] }.
// serious = huset er ikke helt: åpne yttervegger, rom utenfor eller oppå hverandre, store deler av grunnflaten uten rom.
// final = siste forsøk: da lukkes også store hull i ytterveggene med en rett vegg (og det meldes), så huset alltid blir lukket.
const SNAP = .2, TOL = .15, MARGIN = .06;
const fmt = v => String(Math.round(v * 100) / 100);
const at = (x, z) => `(x ${fmt(x)}, z ${fmt(z)})`;
const no = v => String(Math.round(v * 10) / 10).replace('.', ',');
const count = (n, one, many, neuter) => `${n === 1 ? (neuter ? 'Ett' : 'Én') : n} ${n === 1 ? one : many}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`;
// Punktets plass langs veggens linje (s, meter fra (x1,z1)) og avstand ut fra linjen (off).
function along(px, pz, w) {
  const L = wallLength(w) || 1, ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L;
  return { s: (px - w.x1) * ux + (pz - w.z1) * uz, off: -(px - w.x1) * uz + (pz - w.z1) * ux, L };
}
const segDist = (px, pz, w) => { const a = along(px, pz, w), s = clamp(a.s, 0, a.L); return Math.hypot(a.s - s, a.off); };
// Deler veggen i punktet s meter fra (x1,z1). Åpningene havner på den delen midten deres ligger i.
function splitWall(f, w, s) {
  const L = wallLength(w), x = round(w.x1 + (w.x2 - w.x1) * s / L), z = round(w.z1 + (w.z2 - w.z1) * s / L);
  const b = { ...w, id: uid('w'), x1: x, z1: z, openings: w.openings.filter(o => o.pos > s).map(o => ({ ...o, pos: round(o.pos - s) })) };
  w.openings = w.openings.filter(o => o.pos <= s); w.x2 = x; w.z2 = z;
  f.walls.splice(f.walls.indexOf(w) + 1, 0, b); (f._split ??= []).push([w, b]); return b;
}
// Setter sammen igjen yttervegger som kontrollen delte, når delingen ikke trengtes likevel (hjørnet har bare de to veggene).
function rejoin(f) {
  for (const [a, b] of (f._split || []).reverse()) {
    if (!f.walls.includes(a) || !f.walls.includes(b) || !a.exterior || !b.exterior || a.x2 !== b.x1 || a.z2 !== b.z1) continue;
    if (degrees(f.walls.filter(w => w.exterior)).get(key(a.x2, a.z2)) !== 2 || Math.abs(along(b.x2, b.z2, a).off) > .01) continue;
    const La = wallLength(a); a.openings.push(...b.openings.map(o => ({ ...o, pos: round(o.pos + La) }))); a.x2 = b.x2; a.z2 = b.z2;
    f.walls.splice(f.walls.indexOf(b), 1);
  }
  delete f._split;
}
const area = p => Math.abs(p.reduce((s, [x, z], i) => { const [x2, z2] = p[(i + 1) % p.length]; return s + x * z2 - x2 * z; }, 0)) / 2;
function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; }
  return c;
}
const edgeDist = (x, z, p) => Math.min(...p.map(([x1, z1], i) => { const [x2, z2] = p[(i + 1) % p.length]; return segDist(x, z, { x1, z1, x2, z2 }); }));
const inside = (x, z, p, tol = TOL) => inPoly(x, z, p) || edgeDist(x, z, p) <= tol;
const corners = r => [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]];
const degrees = walls => { const d = new Map(); for (const w of walls) for (const k of [key(w.x1, w.z1), key(w.x2, w.z2)]) d.set(k, (d.get(k) || 0) + 1); return d; };
// Ringene ytterveggene danner, som lister av hjørner. Forutsetter at hvert hjørne har nøyaktig to vegger.
function rings(walls) {
  const left = new Set(walls), out = [];
  while (left.size) {
    const first = left.values().next().value, start = key(first.x1, first.z1), poly = [[first.x1, first.z1]];
    let cur = [first.x2, first.z2]; left.delete(first);
    while (key(...cur) !== start) {
      poly.push(cur);
      const k = key(...cur), next = [...left].find(w => key(w.x1, w.z1) === k || key(w.x2, w.z2) === k);
      if (!next) break;
      left.delete(next); cur = key(next.x1, next.z1) === k ? [next.x2, next.z2] : [next.x1, next.z1];
    }
    out.push(poly);
  }
  return out;
}
const wallLike = (x1, z1, x2, z2, like) => ({ id: uid('w'), x1: round(x1), z1: round(z1), x2: round(x2), z2: round(z2), thickness: like?.thickness ?? .2, exterior: true, material: like?.material ?? 'panel', color: like?.color ?? P, openings: [] });

// Samme vegg tegnet to ganger gir flimmer. Vegger som ligger på samme linje og overlapper, slås sammen.
function mergeDoubles(f, fix) {
  let n = 0;
  for (let i = 0; i < f.walls.length; i++) for (let j = i + 1; j < f.walls.length; j++) {
    const a = f.walls[i], b = f.walls[j], p = along(b.x1, b.z1, a), q = along(b.x2, b.z2, a);
    if (Math.abs(p.off) > .1 || Math.abs(q.off) > .1) continue;
    const lo = Math.min(p.s, q.s), hi = Math.max(p.s, q.s);
    if (Math.min(p.L, hi) - Math.max(0, lo) < .3) continue;
    const s0 = Math.min(0, lo), s1 = Math.max(p.L, hi), ux = (a.x2 - a.x1) / p.L, uz = (a.z2 - a.z1) / p.L, Lb = wallLength(b) || 1, ox = a.x1, oz = a.z1;
    a.openings = [...a.openings.map(o => ({ ...o, pos: round(o.pos - s0) })), ...b.openings.map(o => ({ ...o, pos: round(p.s + (q.s - p.s) * o.pos / Lb - s0) }))];
    Object.assign(a, { x1: round(ox + ux * s0), z1: round(oz + uz * s0), x2: round(ox + ux * s1), z2: round(oz + uz * s1) });
    if (b.exterior && !a.exterior) Object.assign(a, { exterior: true, thickness: b.thickness, material: b.material, color: b.color });
    f.walls.splice(j, 1); j = i; n++;
  }
  if (n) fix(`${count(n, 'vegg', 'vegger')} lå oppå en annen vegg og ble slått sammen med den.`);
}
// Endepunkter som nesten møtes, flyttes til samme punkt. Et endepunkt som nesten treffer en annen vegg, flyttes inn på den.
function joinEnds(f, fix) {
  const groups = [];
  for (const w of f.walls) for (const k of [1, 2]) {
    const x = w['x' + k], z = w['z' + k], g = groups.find(g => Math.hypot(g.x - x, g.z - z) <= SNAP);
    if (g) { g.m.push([w, k]); g.x += (x - g.x) / g.m.length; g.z += (z - g.z) / g.m.length; } else groups.push({ x, z, m: [[w, k]] });
  }
  let n = 0;
  for (const g of groups) for (const [w, k] of g.m) {
    const x = round(g.x), z = round(g.z);
    if (Math.hypot(w['x' + k] - x, w['z' + k] - z) > .01) n++;
    w['x' + k] = x; w['z' + k] = z;
  }
  f.walls = f.walls.filter(w => wallLength(w) >= .1);
  for (const g of groups) {
    if (g.m.length !== 1) continue;
    const [w, k] = g.m[0], x = w['x' + k], z = w['z' + k];
    for (const v of f.walls) {
      if (v === w) continue;
      const a = along(x, z, v);
      if (Math.abs(a.off) > .3 || a.s < .05 || a.s > a.L - .05) continue;
      w['x' + k] = round(v.x1 + (v.x2 - v.x1) * a.s / a.L); w['z' + k] = round(v.z1 + (v.z2 - v.z1) * a.s / a.L);
      if (Math.abs(a.off) > .01) n++;
      if (w.exterior && v.exterior) splitWall(f, v, a.s);
      break;
    }
  }
  if (n) fix(`${count(n, 'veggende', 'veggender')} som nesten møttes, ble koblet sammen.`);
}
// Får ytterveggene til å danne lukkede ringer. Returnerer ringene, eller null når det ikke gikk.
function closeOutline(f, fix, bad, final, fill = true) {
  let ext = f.walls.filter(w => w.exterior);
  if (!ext.length && f.walls.some(w => w.thickness >= .15)) {
    for (const w of f.walls) w.exterior = w.thickness >= .15;
    ext = f.walls.filter(w => w.exterior); fix('Ytterveggene var ikke merket og ble funnet ut fra veggtykkelsen.');
  }
  if (!ext.length) {
    const b = bounds(f); if (!b) return null;
    const like = f.walls[0];
    f.walls.push(wallLike(b.x0, b.z1, b.x1, b.z1, like), wallLike(b.x1, b.z1, b.x1, b.z0, like), wallLike(b.x1, b.z0, b.x0, b.z0, like), wallLike(b.x0, b.z0, b.x0, b.z1, like));
    fix('Ytterveggene manglet og ble lagt rundt rommene.'); return [[[b.x0, b.z1], [b.x1, b.z1], [b.x1, b.z0], [b.x0, b.z0]]];
  }
  // Yttervegger som krysser hverandre, deles i krysset. Små stumper som stikker ut forbi et hjørne, fjernes.
  for (let i = 0; i < ext.length; i++) for (let j = i + 1; j < ext.length; j++) {
    const a = ext[i], b = ext[j], p = along(b.x1, b.z1, a), q = along(b.x2, b.z2, a);
    if (Math.sign(p.off) === Math.sign(q.off) || Math.abs(p.off - q.off) < 1e-9) continue;
    const s = p.s + (q.s - p.s) * p.off / (p.off - q.off), t = wallLength(b) * p.off / (p.off - q.off);
    if (s < .05 || s > p.L - .05 || t < .05 || t > wallLength(b) - .05) continue;
    ext.push(splitWall(f, a, s), splitWall(f, b, t));
  }
  // Først stumpene, så veggene der begge ender har tre eller flere yttervegger (de deler huset i to, og er egentlig innervegger).
  let spurs = 0, chords = 0;
  for (const chord of [false, true]) for (let again = true; again;) {
    again = false; const d = degrees(ext);
    for (const w of ext) {
      const d1 = d.get(key(w.x1, w.z1)), d2 = d.get(key(w.x2, w.z2));
      if (!chord && Math.min(d1, d2) === 1 && Math.max(d1, d2) >= 3 && wallLength(w) < .7 && !w.openings.length) { f.walls.splice(f.walls.indexOf(w), 1); spurs++; again = true; break; }
      if (chord && d1 >= 3 && d2 >= 3) { w.exterior = false; w.thickness = Math.min(w.thickness, .15); chords++; again = true; break; }
    }
    ext = f.walls.filter(w => w.exterior);
  }
  if (spurs) fix(`${count(spurs, 'veggstump', 'veggstumper')} som stakk ut forbi et hjørne, ble fjernet.`);
  if (chords) fix(`${count(chords, 'vegg', 'vegger')} inne i huset var merket som yttervegg og ble gjort om til innervegg.`);
  // Åpne ender som ligger nær hverandre, kobles med en ny vegg.
  const open = () => { const d = degrees(ext); return ext.flatMap(w => [[w.x1, w.z1, w], [w.x2, w.z2, w]]).filter(([x, z]) => d.get(key(x, z)) === 1); };
  let ends = open(), filled = 0;
  while (fill && ends.length >= 2) {
    let best = null;
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      const dd = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]);
      if (ends[i][2] !== ends[j][2] && (!best || dd < best[0])) best = [dd, ends[i], ends[j]];
    }
    if (!best || best[0] > (final ? Infinity : ends.length === 2 ? 3 : 1.5)) break;
    f.walls.push(wallLike(best[1][0], best[1][1], best[2][0], best[2][1], best[1][2]));
    if (best[0] > 3) bad(`Ytterveggene var åpne mellom ${at(best[1][0], best[1][1])} og ${at(best[2][0], best[2][1])} og ble lukket med en rett vegg på ${no(best[0])} m. Sjekk at husets form stemmer der.`, false);
    else filled++;
    ext = f.walls.filter(w => w.exterior); ends = open();
  }
  if (filled) fix(`${count(filled, 'åpning', 'åpninger')} i ytterveggene ble lukket med en ny vegg.`);
  const d = degrees(ext), loose = [...d].filter(([, n]) => n === 1).map(([k]) => k), forks = [...d].filter(([, n]) => n > 2).map(([k]) => k);
  const pts = ks => ks.slice(0, 4).map(k => { const [x, z] = k.split(',').map(Number); return at(x, z); }).join(', ');
  if (loose.length) bad(`Ytterveggene danner ikke en lukket form. Åpne ender ved ${pts(loose)}.`);
  if (forks.length) bad(`Ytterveggene grener seg ved ${pts(forks)}, så det er uklart hva som er ute og inne.`);
  if (loose.length || forks.length) return null;
  const rs = rings(ext).filter(r => r.length >= 3);
  if (rs.length > 1) bad(`Ytterveggene danner ${rs.length} separate ringer. Hører alle til samme hus?`, false);
  return rs;
}
function checkRooms(f, rs, fix, bad) {
  if (!f.rooms.length) return bad('Etasjen har ingen rom.');
  if (rs) for (const r of f.rooms) {
    const fits = (room, p) => corners(room).every(([x, z]) => inside(x, z, p));
    if (rs.some(p => fits(r, p))) continue;
    const home = rs.find(p => inside(r.x + r.w / 2, r.z + r.d / 2, p, 0)) || rs[0];
    const b = { x0: Math.min(...home.map(v => v[0])), x1: Math.max(...home.map(v => v[0])), z0: Math.min(...home.map(v => v[1])), z1: Math.max(...home.map(v => v[1])) };
    const c = { ...r, x: Math.max(r.x, b.x0), z: Math.max(r.z, b.z0) }; c.w = Math.min(r.x + r.w, b.x1) - c.x; c.d = Math.min(r.z + r.d, b.z1) - c.z;
    if (c.w >= .5 && c.d >= .5 && c.w * c.d > r.w * r.d * .6 && fits(c, home)) {
      Object.assign(r, { x: round(c.x), z: round(c.z), w: round(c.w), d: round(c.d) }); fix(`Rommet «${r.name}» stakk ut av huset og ble kuttet ved ytterveggen.`); continue;
    }
    bad(`Rommet «${r.name}» ${at(r.x, r.z)}, ${no(r.w)} × ${no(r.d)} m, ligger delvis utenfor ytterveggene.`);
  }
  // Rom som overlapper litt, deles på midten av overlappen. Større overlapp meldes.
  for (let i = 0; i < f.rooms.length; i++) for (let j = i + 1; j < f.rooms.length; j++) {
    const a = f.rooms[i], b = f.rooms[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
    if (ix <= .05 || iz <= .05) continue;
    const [X, W, o] = ix <= iz ? ['x', 'w', ix] : ['z', 'd', iz], [l, r] = a[X] + a[W] / 2 <= b[X] + b[W] / 2 ? [a, b] : [b, a];
    const mid = (r[X] + l[X] + l[W]) / 2, re = r[X] + r[W];
    if (o <= .6 && l[X] < r[X] && l[X] + l[W] < re && mid - l[X] >= .5 && re - mid >= .5) {
      l[W] = round(mid - l[X]); r[X] = round(mid); r[W] = round(re - mid);
      fix(`Rommene «${a.name}» og «${b.name}» overlappet litt og ble delt på midten.`); continue;
    }
    bad(`Rommene «${a.name}» og «${b.name}» ligger oppå hverandre (${no(ix)} × ${no(iz)} m overlapp).`);
  }
  if (rs) {
    const total = rs.reduce((s, p) => s + area(p), 0), used = f.rooms.reduce((s, r) => s + r.w * r.d, 0);
    if (total > 0 && used < total * .85) bad(`Rommene dekker bare ${Math.round(used / total * 100)} % av grunnflaten. ${no(total - used)} m² innenfor ytterveggene har ikke noe rom.`);
  }
}
function checkOpenings(f, fix) {
  const H = f.height; let moved = 0, doubles = 0, dropped = 0;
  for (const w of f.walls) {
    const L = wallLength(w);
    if (L < .5) { dropped += w.openings.length; w.openings = []; continue; }
    for (const o of w.openings) {
      const before = JSON.stringify(o);
      o.width = round(Math.min(o.width, L - .2));
      if (o.type === 'door') { o.sill = 0; o.height = round(Math.min(o.height, H - .05)); }
      else if (o.sill + o.height > H - .05) { o.height = round(Math.min(o.height, H - .25)); o.sill = round(Math.max(0, Math.min(o.sill, H - .1 - o.height))); }
      o.pos = round(clamp(o.pos, o.width / 2 + .1, L - o.width / 2 - .1));
      if (JSON.stringify(o) !== before) moved++;
    }
    w.openings.sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < w.openings.length; i++) {
      const a = w.openings[i - 1], b = w.openings[i], gap = (b.pos - b.width / 2) - (a.pos + a.width / 2);
      if (gap >= .05) continue;
      if (a.type === b.type && Math.abs(a.pos - b.pos) < .3) { w.openings.splice(i--, 1); doubles++; continue; }
      const need = .1 - gap;
      if (b.pos + need + b.width / 2 <= L - .1) { b.pos = round(b.pos + need); moved++; }
      else if (a.pos - need - a.width / 2 >= .1) { a.pos = round(a.pos - need); moved++; }
      else { w.openings.splice(b.width <= a.width ? i : i - 1, 1); i--; dropped++; }
    }
  }
  const what = n => n === 1 ? 'Én dør eller ett vindu' : `${n} dører og vinduer`;
  if (moved) fix(`${what(moved)} ble justert så ${moved === 1 ? 'den' : 'de'} ligger innenfor veggen sin uten å overlappe andre.`);
  if (doubles) fix(`${what(doubles)} var lagt inn to ganger. ${doubles === 1 ? 'Kopien' : 'Kopiene'} ble fjernet.`);
  if (dropped) fix(`${what(dropped)} fikk ikke plass i veggen og ble fjernet.`);
}
function checkFurniture(f, fix) {
  if (!f.rooms.length) return;
  let moved = 0, shrunk = 0, removed = 0;
  const dist = (m, r) => Math.hypot(Math.max(r.x - m.x, 0, m.x - r.x - r.w), Math.max(r.z - m.z, 0, m.z - r.z - r.d));
  f.furniture = f.furniture.filter(m => {
    const r = f.rooms.reduce((best, r) => dist(m, r) < dist(m, best) ? r : best);
    if (dist(m, r) > 1.5) { removed++; return false; }
    const a = m.rot * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const half = () => [(m.w * c + m.d * s) / 2, (m.w * s + m.d * c) / 2];
    let [hx, hz] = half(); const k = Math.min(1, (r.w - 2 * MARGIN) / (2 * hx), (r.d - 2 * MARGIN) / (2 * hz));
    if (k < 1) { m.w = round(Math.max(.1, m.w * k)); m.d = round(Math.max(.1, m.d * k)); [hx, hz] = half(); shrunk++; }
    const x = round(clamp(m.x, r.x + MARGIN + hx, r.x + r.w - MARGIN - hx)), z = round(clamp(m.z, r.z + MARGIN + hz, r.z + r.d - MARGIN - hz));
    if (Math.hypot(x - m.x, z - m.z) > .01) moved++;
    m.x = x; m.z = z; return true;
  });
  if (moved) fix(`${count(moved, 'møbel', 'møbler', true)} ble flyttet helt inn i rommet sitt.`);
  if (shrunk) fix(`${count(shrunk, 'møbel', 'møbler', true)} var større enn rommet og ble gjort mindre.`);
  if (removed) fix(`${count(removed, 'møbel', 'møbler', true)} sto utenfor alle rom og ble fjernet.`);
}
export function inspect(input, { final = false } = {}) {
  const house = JSON.parse(JSON.stringify(input)), fixed = [], problems = [];
  for (const f of house.floors) {
    const fix = t => fixed.push(`${f.name}: ${t}`), bad = (t, serious = true) => problems.push({ text: `${f.name}: ${t}`, serious });
    mergeDoubles(f, fix); joinEnds(f, fix);
    const rs = closeOutline(f, fix, bad, final); rejoin(f);
    checkRooms(f, rs, fix, bad); checkOpenings(f, fix); checkFurniture(f, fix);
  }
  if (!house.roof) { house.roof = { type: 'gable', pitch: 30, overhang: .4, material: 'takstein', color: '#3a3a3c' }; fixed.push('Taket manglet og ble lagt til som saltak.'); }
  if (!house.floors.some(f => f.walls.some(w => w.exterior && w.openings.some(o => o.type === 'door')))) problems.push({ text: 'Huset har ingen ytterdør.', serious: false });
  return { house, fixed, problems };
}

// Ytterkonturen av en etasje: ringene ytterveggene danner (lister av [x, z]-hjørner),
// eller rektangelet rundt etasjen når ytterveggene ikke danner lukkede ringer. null når etasjen er tom.
export function outline(floor) {
  const ext = floor.walls.filter(w => w.exterior);
  if (ext.length >= 3 && [...degrees(ext).values()].every(n => n === 2)) {
    const rs = rings(ext).filter(r => r.length >= 3);
    if (rs.length) return rs;
  }
  const b = bounds(floor);
  return b && [[[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]];
}
export { inPoly };

// Rydder veggene i en etasje etter at brukeren har lagt til rom eller vegger: vegger oppå hverandre slås sammen,
// ender som nesten møtes kobles, en yttervegg som en ny yttervegg ender midt på deles, og vegger som da ligger
// inne i huset blir innervegger. Hull fylles ikke, og ingenting annet endres. Brukes så taket følger ytterveggene.
export function tidy(floor) {
  if (!floor.walls.some(w => w.exterior)) return floor;
  const none = () => {};
  mergeDoubles(floor, none); joinEnds(floor, none); closeOutline(floor, none, none, false, false); rejoin(floor);
  return floor;
}

// Flytter en vegg med (dx, dz). Vegger som møter den i et hjørne, følger med; vegger som ender midt på den, forlenges
// eller kortes inn; rom med en kant langs veggen følger kanten. Møter veggen andre vegger i endene, flyttes den bare på
// tvers av seg selv, så den henger fast og hjørnene ikke blir skjeve. Åpningene ligger i veggen og følger av seg selv. Returnerer flyttet (dx, dz).
export function moveWall(floor, w, dx, dz) {
  const L = wallLength(w) || 1, ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, E = .03;
  const at = (v, k, x, z) => Math.hypot(v['x' + k] - x, v['z' + k] - z) < E;
  const touches = (x, z) => floor.walls.some(v => v !== w && segDist(x, z, v) < E); // enden møter en annen vegg (hjørne eller midt på)
  const linked = touches(w.x1, w.z1) || touches(w.x2, w.z2);
  if (linked) { const p = -dx * uz + dz * ux; dx = -uz * p; dz = ux * p; }
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return [0, 0];
  const p = -dx * uz + dz * ux; // flytting på tvers av veggen
  for (const v of floor.walls) {
    if (v === w) continue;
    for (const k of [1, 2]) {
      const x = v['x' + k], z = v['z' + k];
      if (at(v, k, w.x1, w.z1) || at(v, k, w.x2, w.z2)) { v['x' + k] = round(x + dx); v['z' + k] = round(z + dz); continue; }
      const s = (x - w.x1) * ux + (z - w.z1) * uz, off = -(x - w.x1) * uz + (z - w.z1) * ux;
      if (Math.abs(off) < E && s > E && s < L - E) { v['x' + k] = round(x - uz * p); v['z' + k] = round(z + ux * p); }
    }
  }
  const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
  if (Math.abs(uz) < 1e-6 || Math.abs(ux) < 1e-6) for (const r of floor.rooms) { // rom med kant langs veggen
    if (Math.abs(uz) < 1e-6) { // veggen går langs x
      if (Math.min(r.x + r.w, hi(w.x1, w.x2)) - Math.max(r.x, lo(w.x1, w.x2)) < .1) continue;
      if (Math.abs(r.z - w.z1) < E) { const nd = r.d - dz; if (nd >= .5) { r.z = round(r.z + dz); r.d = round(nd); } }
      else if (Math.abs(r.z + r.d - w.z1) < E) { const nd = r.d + dz; if (nd >= .5) r.d = round(nd); }
    } else {
      if (Math.min(r.z + r.d, hi(w.z1, w.z2)) - Math.max(r.z, lo(w.z1, w.z2)) < .1) continue;
      if (Math.abs(r.x - w.x1) < E) { const nw = r.w - dx; if (nw >= .5) { r.x = round(r.x + dx); r.w = round(nw); } }
      else if (Math.abs(r.x + r.w - w.x1) < E) { const nw = r.w + dx; if (nw >= .5) r.w = round(nw); }
    }
  }
  w.x1 = round(w.x1 + dx); w.x2 = round(w.x2 + dx); w.z1 = round(w.z1 + dz); w.z2 = round(w.z2 + dz);
  return [dx, dz];
}
// Endrer lengde og/eller retning på en vegg (startpunktet står stille). Vegger som møtte veggen i sluttpunktet, følger med,
// og dører og vinduer holdes innenfor veggen.
export function resizeWall(floor, w, len, deg) {
  const ox = w.x2, oz = w.z2; setWall(w, len, deg);
  for (const v of floor.walls) if (v !== w) for (const k of [1, 2]) if (Math.hypot(v['x' + k] - ox, v['z' + k] - oz) < .03) { v['x' + k] = w.x2; v['z' + k] = w.z2; }
  fitOpenings(w);
}
// Holder dører og vinduer innenfor veggen sin.
export function fitOpenings(w) {
  const L = wallLength(w);
  for (const o of w.openings) {
    o.width = round(Math.max(.3, Math.min(o.width, L - .1)));
    o.pos = round(Math.min(Math.max(o.pos, o.width / 2 + .05), Math.max(o.width / 2 + .05, L - o.width / 2 - .05)));
  }
}
