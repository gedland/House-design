// Husets JSON-skjema (versjon 1). Alle mål i meter, y er opp. Dette er det eneste formatet appen leser og skriver.
// {
//   version: 1, name,
//   floors: [{ id, name, height,
//     rooms:     [{ id, name, x, z, w, d, material, color }],            // x,z = hjørne, w = bredde (x), d = dybde (z); materiale/farge gjelder gulvet
//     walls:     [{ id, x1, z1, x2, z2, thickness, material, color,
//                   openings: [{ id, type: 'door'|'window', pos, width, height, sill, color }] }],  // pos = senter, målt fra (x1,z1)
//     furniture: [{ id, type, x, z, rot, w, d, h, material, color }]     // x,z = senter, rot i grader
//   }],
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
export const OPENINGS = { door: { label: 'Dør', width: .9, height: 2.1, sill: 0, color: '#5a3b26' }, window: { label: 'Vindu', width: 1.2, height: 1.2, sill: .9, color: '#f2efe8' } };
export const ROOFS = { gable: 'Saltak', hip: 'Valmtak', flat: 'Flatt tak' };
export const uid = p => p + Math.random().toString(36).slice(2, 8);
export const round = v => Math.round(v * 1000) / 1000;

const P = '#e9e4d8', I = '#f1eee7', WF = '#f2efe8';
const win = (pos, width = 1.2, height = 1.2, sill = .9) => ({ type: 'window', pos, width, height, sill, color: WF });
const door = (pos, color = '#efece6') => ({ type: 'door', pos, width: .9, height: 2.1, sill: 0, color });
const outer = (x1, z1, x2, z2, openings) => ({ x1, z1, x2, z2, thickness: .2, material: 'panel', color: P, openings });
const inner = (x1, z1, x2, z2, openings) => ({ x1, z1, x2, z2, thickness: .1, material: 'maling', color: I, openings });
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
    id: id(f, 'f'), name: String(f.name || `${i + 1}. etasje`).slice(0, 40), height: n(f.height, 2.4, 1.8, 6),
    rooms: arr(f.rooms).map(r => ({ id: id(r, 'r'), name: String(r.name || 'Rom').slice(0, 40), x: n(r.x, 0), z: n(r.z, 0), w: n(r.w, 3, .5, 60), d: n(r.d, 3, .5, 60), material: mt(r.material, 'tre'), color: col(r.color, '#c8a57a') })),
    walls: arr(f.walls).map(w => ({ id: id(w, 'w'), x1: n(w.x1, 0), z1: n(w.z1, 0), x2: n(w.x2, 0), z2: n(w.z2, 0), thickness: n(w.thickness, .15, .05, .6), material: mt(w.material, 'maling'), color: col(w.color, P),
      openings: arr(w.openings).map(o => { const t = o.type === 'door' ? 'door' : 'window', d = OPENINGS[t]; return { id: id(o, 'o'), type: t, pos: n(o.pos, 1, 0, 200), width: n(o.width, d.width, .3, 12), height: n(o.height, d.height, .3, 5), sill: n(o.sill, d.sill, 0, 5), color: col(o.color, d.color) }; }) }))
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

// ---- Kontroll av et tolket hus ----
// check() tar et normalisert hus (fra Claude) og sørger for at det er et helt, lukket hus før det tegnes:
// rommene overlapper ikke, grunnflaten er omsluttet av yttervegger, åpninger ligger innenfor veggen sin og møbler står inne i et rom.
// Det som kan rettes, rettes og listes i «fixed». Det som ikke kan rettes trygt, listes i «problems». Ingenting endres stille.
const EPS = .02, TOL = .15;
// En vegg langs x- eller z-aksen som intervall: k = aksen den går langs, c = hvor den ligger, a..b = utstrekning, fwd = om (x1,z1) er i a-enden.
function span(w) {
  const k = Math.abs(w.z1 - w.z2) < EPS ? 'x' : Math.abs(w.x1 - w.x2) < EPS ? 'z' : null; if (!k) return null;
  const [p, q, c] = k === 'x' ? [w.x1, w.x2, w.z1] : [w.z1, w.z2, w.x1];
  return { w, k, c, a: Math.min(p, q), b: Math.max(p, q), fwd: q >= p };
}
const absPos = (s, o) => s.fwd ? s.a + o.pos : s.b - o.pos;
function setSpan(w, a, b) { // åpningene blir stående på samme sted i rommet
  const s = span(w), at = w.openings.map(o => absPos(s, o)), [p, q] = s.fwd ? [a, b] : [b, a];
  if (s.k === 'x') { w.x1 = p; w.x2 = q; } else { w.z1 = p; w.z2 = q; }
  w.openings.forEach((o, i) => { o.pos = round(s.fwd ? at[i] - a : b - at[i]); });
}
// Rutenett over etasjen der alle romkanter og veggender er linjer. full = ruten ligger i et rom, wall = rutekanten dekkes av en vegg.
// wall('x', i, j) er kanten langs x ved zs[j] (mellom rute (i,j-1) og (i,j)); wall('z', i, j) er kanten langs z ved xs[i] (mellom (i-1,j) og (i,j)).
function grid(f) {
  const sp = f.walls.map(span).filter(Boolean), u = v => [...new Set(v.map(round))].sort((a, b) => a - b);
  const line = k => { const v = u([...f.rooms.flatMap(r => k === 'x' ? [r.x, r.x + r.w] : [r.z, r.z + r.d]), ...sp.flatMap(s => s.k === k ? [s.a, s.b] : [s.c])]); return v.length ? [v[0] - 1, ...v, v.at(-1) + 1] : [-1, 1]; };
  const xs = line('x'), zs = line('z'), nx = xs.length - 1, nz = zs.length - 1;
  const cells = Array.from({ length: nx }, (_, i) => Array.from({ length: nz }, (_, j) => { const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2; return f.rooms.find(r => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d) || null; }));
  const room = (i, j) => cells[i]?.[j] || null, full = (i, j) => !!room(i, j);
  const wall = (k, i, j) => { const [c, lo, hi] = k === 'x' ? [zs[j], xs[i], xs[i + 1]] : [xs[i], zs[j], zs[j + 1]]; return sp.some(s => s.k === k && Math.abs(s.c - c) < EPS && s.a <= lo + EPS && s.b >= hi - EPS); };
  // Alle rutekanter som [k, i, j, ruten på den ene siden, ruten på den andre siden]
  const edges = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j < nz; j++) edges.push(['z', i, j, room(i - 1, j), room(i, j)]);
  for (let i = 0; i < nx; i++) for (let j = 0; j <= nz; j++) edges.push(['x', i, j, room(i, j - 1), room(i, j)]);
  const ends = ([k, i, j]) => k === 'x' ? { c: zs[j], a: xs[i], b: xs[i + 1] } : { c: xs[i], a: zs[j], b: zs[j + 1] };
  return { xs, zs, nx, nz, full, wall, edges, ends };
}
const area = r => r.w * r.d, plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function check(house) {
  const fixed = [], problems = [], many = house.floors.length > 1;
  house.floors.forEach((f, fi) => {
    const at = many ? `${f.name}: ` : '', fix = t => fixed.push(at + t), bad = t => problems.push(at + t);

    // 1. Mål som nesten møtes, trekkes sammen, så kanter og hjørner faller nøyaktig på hverandre.
    let moved = false;
    for (const w of f.walls) { if (Math.abs(w.x1 - w.x2) < TOL && Math.abs(w.z1 - w.z2) >= TOL) w.x2 = w.x1; else if (Math.abs(w.z1 - w.z2) < TOL) w.z2 = w.z1; }
    const snapper = vals => {
      const n = new Map(); vals.forEach(v => n.set(v, (n.get(v) || 0) + 1));
      const m = new Map(); let g = [];
      const flush = () => { const best = g.reduce((a, b) => n.get(b) > n.get(a) ? b : a), v = Math.round(best * 20) / 20; g.forEach(x => { m.set(x, v); if (Math.abs(x - v) > .03) moved = true; }); g = []; };
      for (const v of [...n.keys()].sort((a, b) => a - b)) { if (g.length && v - g[0] > TOL) flush(); g.push(v); }
      if (g.length) flush();
      return v => m.get(v);
    };
    const sx = snapper([...f.rooms.flatMap(r => [r.x, round(r.x + r.w)]), ...f.walls.flatMap(w => [w.x1, w.x2])]);
    const sz = snapper([...f.rooms.flatMap(r => [r.z, round(r.z + r.d)]), ...f.walls.flatMap(w => [w.z1, w.z2])]);
    for (const r of f.rooms) { const x1 = sx(round(r.x + r.w)), z1 = sz(round(r.z + r.d)); r.x = sx(r.x); r.z = sz(r.z); r.w = round(x1 - r.x); r.d = round(z1 - r.z); }
    for (const w of f.walls) { w.x1 = sx(w.x1); w.x2 = sx(w.x2); w.z1 = sz(w.z1); w.z2 = sz(w.z2); }
    if (moved) fix('Rettet opp mål som nesten møttes, så vegger og rom ligger kant i kant.');
    f.rooms = f.rooms.filter(r => r.w >= .5 && r.d >= .5 || (fix(`Fjernet rommet «${r.name}», som var for lite til å tegnes.`), false));
    f.walls = f.walls.filter(w => wallLength(w) >= .1);

    // 2. Rom som overlapper: det minste krympes til de ligger kant i kant, eller fjernes hvis det ligger helt oppå et annet.
    for (let guard = 0, again = true; again && guard < 200; guard++) {
      again = false;
      pairs: for (const a of f.rooms) for (const b of f.rooms) {
        if (a === b) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
        if (ox <= EPS || oz <= EPS) continue;
        const [v, o] = area(a) <= area(b) ? [a, b] : [b, a], [p, s] = ox <= oz ? ['x', 'w'] : ['z', 'd'];
        if (v[p] + v[s] / 2 < o[p] + o[s] / 2) v[s] = round(o[p] - v[p]); else { const e = v[p] + v[s]; v[p] = round(o[p] + o[s]); v[s] = round(e - v[p]); }
        if (v[s] < .5) { f.rooms.splice(f.rooms.indexOf(v), 1); fix(`Fjernet rommet «${v.name}», som lå oppå «${o.name}».`); }
        else fix(`Rommene «${v.name}» og «${o.name}» overlappet. «${v.name}» ble krympet.`);
        again = true; break pairs;
      }
    }

    // 3. Vegger som ligger oppå hverandre, slås sammen. Åpningene følger med.
    let merged = 0;
    const groups = {};
    for (const s of f.walls.map(span).filter(Boolean)) (groups[s.k + round(s.c)] ??= []).push(s);
    for (const g of Object.values(groups)) {
      g.sort((p, q) => p.a - q.a || q.b - p.b);
      let keep = g[0];
      for (const s of g.slice(1)) {
        const k = span(keep.w);
        if (s.a >= k.b - EPS) { keep = s; continue; }
        merged++;
        const mv = s.w.openings.filter(o => absPos(s, o) < k.b);
        for (const o of mv) { const p = absPos(s, o); o.pos = round(k.fwd ? p - k.a : k.b - p); keep.w.openings.push(o); }
        s.w.openings = s.w.openings.filter(o => !mv.includes(o));
        if (s.b <= k.b + EPS) f.walls.splice(f.walls.indexOf(s.w), 1); else { setSpan(s.w, k.b, s.b); keep = span(s.w); }
      }
    }
    if (merged) fix(`Slo sammen ${plural(merged, 'vegg', 'vegger')} som lå oppå en annen vegg.`);

    // 4. Tomrom som er stengt inne av vegger eller rom, fylles med et rom, så rommene dekker hele grunnflaten.
    const below = fi && bounds(house.floors[fi - 1]);
    if (!f.rooms.length && !f.walls.length && below) {
      f.rooms.push({ id: uid('r'), name: 'Rom', x: below.x0, z: below.z0, w: round(below.x1 - below.x0), d: round(below.z1 - below.z0), material: 'tre', color: '#c8a57a' });
      fix('Etasjen var tom og fikk ett rom med samme grunnflate som etasjen under.');
    }
    let g = grid(f);
    const out = Array.from({ length: g.nx }, () => []), stack = [[0, 0]]; out[0][0] = true;
    while (stack.length) {
      const [i, j] = stack.pop();
      for (const [a, b, blocked] of [[i + 1, j, () => g.wall('z', i + 1, j)], [i - 1, j, () => g.wall('z', i, j)], [i, j + 1, () => g.wall('x', i, j + 1)], [i, j - 1, () => g.wall('x', i, j)]])
        if (a >= 0 && b >= 0 && a < g.nx && b < g.nz && !out[a][b] && !g.full(a, b) && !blocked()) { out[a][b] = true; stack.push([a, b]); }
    }
    const like = [...f.rooms].sort((a, b) => area(b) - area(a))[0], used = Array.from({ length: g.nx }, () => []);
    const hole = (i, j) => i < g.nx && j < g.nz && !out[i][j] && !g.full(i, j) && !used[i][j];
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      if (!hole(i, j)) continue;
      let i2 = i, j2 = j;
      while (hole(i2 + 1, j)) i2++;
      const row = jj => { for (let ii = i; ii <= i2; ii++) if (!hole(ii, jj)) return false; return true; };
      while (row(j2 + 1)) j2++;
      for (let ii = i; ii <= i2; ii++) for (let jj = j; jj <= j2; jj++) used[ii][jj] = true;
      const x = g.xs[i], z = g.zs[j], w = round(g.xs[i2 + 1] - x), d = round(g.zs[j2 + 1] - z);
      if (w >= .5 && d >= .5) {
        f.rooms.push({ id: uid('r'), name: 'Rom', x, z, w, d, material: like?.material || 'tre', color: like?.color || '#c8a57a' });
        fix(`Fylte et tomt område på ${Math.round(w * d * 10) / 10} m² innenfor veggene med et nytt rom.`);
      } else { // en smal stripe: naborommet med samme kant utvides over den
        const n = f.rooms.find(r => Math.abs(r.z - z) < EPS && Math.abs(r.d - d) < EPS && (Math.abs(r.x + r.w - x) < EPS || Math.abs(r.x - x - w) < EPS))
          || f.rooms.find(r => Math.abs(r.x - x) < EPS && Math.abs(r.w - w) < EPS && (Math.abs(r.z + r.d - z) < EPS || Math.abs(r.z - z - d) < EPS));
        if (!n) { bad('Det er en smal glipe mellom rommene som ikke kunne fylles.'); continue; }
        if (Math.abs(n.d - d) < EPS && Math.abs(n.z - z) < EPS) { n.x = Math.min(n.x, x); n.w = round(n.w + w); } else { n.z = Math.min(n.z, z); n.d = round(n.d + d); }
        fix(`Utvidet rommet «${n.name}» over en smal glipe.`);
      }
    }
    if (!f.rooms.length) { bad('Etasjen har ingen rom, så den har ikke noe gulv eller noen lukket form.'); }

    // 5. Vegger som stikker utenfor grunnflaten, kortes ned eller fjernes.
    g = grid(f);
    let cut = 0, gone = 0;
    const inRoom = (x, z) => f.rooms.some(r => x >= r.x - EPS && x <= r.x + r.w + EPS && z >= r.z - EPS && z <= r.z + r.d + EPS);
    if (f.rooms.length) for (const w of [...f.walls]) {
      const s = span(w);
      if (!s) { if (![.25, .5, .75].some(t => inRoom(w.x1 + (w.x2 - w.x1) * t, w.z1 + (w.z2 - w.z1) * t))) { f.walls.splice(f.walls.indexOf(w), 1); gone++; } continue; }
      const touch = g.edges.filter(e => e[0] === s.k && (e[3] || e[4])).map(g.ends).filter(e => Math.abs(e.c - s.c) < EPS && e.a >= s.a - EPS && e.b <= s.b + EPS);
      if (!touch.length) { f.walls.splice(f.walls.indexOf(w), 1); gone++; continue; }
      const a = Math.min(...touch.map(e => e.a)), b = Math.max(...touch.map(e => e.b));
      if (a > s.a + EPS || b < s.b - EPS) { setSpan(w, a, b); cut++; }
    }
    if (gone) fix(`Fjernet ${plural(gone, 'vegg', 'vegger')} som sto utenfor huset.`);
    if (cut) fix(`Kortet ned ${plural(cut, 'vegg', 'vegger')} som stakk utenfor huset.`);

    // 6. Ytterkanten av grunnflaten skal være dekket av vegger hele veien rundt. Det som mangler, legges til.
    g = grid(f);
    const rim = g.edges.filter(e => !e[3] !== !e[4]), onRim = f.walls.find(w => { const s = span(w); return s && rim.some(e => { const p = g.ends(e); return e[0] === s.k && Math.abs(p.c - s.c) < EPS && p.a >= s.a - EPS && p.b <= s.b + EPS; }); });
    const tpl = onRim || [...f.walls].sort((a, b) => b.thickness - a.thickness)[0] || house.floors.flatMap(x => x.walls).sort((a, b) => b.thickness - a.thickness)[0] || { thickness: .2, material: 'panel', color: '#e9e4d8' };
    const gaps = rim.filter(e => !g.wall(e[0], e[1], e[2])).map(e => ({ k: e[0], ...g.ends(e) })).sort((p, q) => p.k.localeCompare(q.k) || p.c - q.c || p.a - q.a);
    const runs = [];
    for (const e of gaps) { const l = runs.at(-1); if (l && l.k === e.k && Math.abs(l.c - e.c) < EPS && Math.abs(l.b - e.a) < EPS) l.b = e.b; else runs.push({ ...e }); }
    for (const r of runs) f.walls.push({ id: uid('w'), ...(r.k === 'x' ? { x1: r.a, z1: r.c, x2: r.b, z2: r.c } : { x1: r.c, z1: r.a, x2: r.c, z2: r.b }), thickness: Math.max(.15, tpl.thickness), material: tpl.material, color: tpl.color, openings: [] });
    if (runs.length) fix(`La til ${plural(runs.length, 'yttervegg', 'yttervegger')} som manglet (${Math.round(runs.reduce((s, r) => s + r.b - r.a, 0) * 10) / 10} m), så huset er lukket.`);

    // 7. Åpninger skal ligge innenfor veggen sin, under taket, og ikke oppå hverandre.
    let tuned = 0, dropped = 0;
    for (const w of f.walls) {
      const L = wallLength(w), keep = [];
      for (const o of [...w.openings].sort((a, b) => a.pos - b.pos)) {
        const was = JSON.stringify(o), max = L - .2;
        if (max < .4) { dropped++; continue; }
        if (o.type === 'door') o.sill = 0;
        o.width = round(Math.min(o.width, max));
        o.sill = round(Math.min(o.sill, f.height - .35)); o.height = round(Math.min(o.height, f.height - .05 - o.sill));
        const prev = keep.at(-1), lo = Math.max(.1, prev ? prev.pos + prev.width / 2 + .1 : 0) + o.width / 2, hi = L - .1 - o.width / 2;
        if (lo > hi + EPS) { dropped++; continue; }
        o.pos = round(Math.min(hi, Math.max(lo, o.pos)));
        if (JSON.stringify(o) !== was) tuned++;
        keep.push(o);
      }
      w.openings = keep;
    }
    if (tuned) fix(`Flyttet eller krympet ${plural(tuned, 'dør eller vindu', 'dører og vinduer')} som ikke lå innenfor veggen sin.`);
    if (dropped) fix(`Fjernet ${plural(dropped, 'dør eller vindu', 'dører og vinduer')} som det ikke var plass til i veggen.`);

    // 8. Hvert rom skal kunne nås: en dør i en av veggene rundt, eller åpen overgang til naborommet. Første etasje skal ha ytterdør.
    g = grid(f);
    const sp = f.walls.map(span).filter(Boolean), outer = g.edges.filter(e => !e[3] !== !e[4]);
    const doorsAt = e => { const p = g.ends(e); return sp.some(s => s.k === e[0] && Math.abs(s.c - p.c) < EPS && s.w.openings.some(o => o.type === 'door' && absPos(s, o) > p.a - EPS && absPos(s, o) < p.b + EPS)); };
    if (!fi && f.rooms.length && !outer.some(doorsAt)) bad('Fant ingen ytterdør. Legg til en dør i ytterveggen der inngangen er.');
    for (const r of f.rooms) {
      if (fi && f.rooms.length === 1) break; // ett rom oppe nås fra trappa
      const mine = g.edges.filter(e => (e[3] === r) !== (e[4] === r));
      if (mine.some(e => doorsAt(e) || (e[3] && e[4] && !g.wall(e[0], e[1], e[2])))) continue;
      // sett inn en dør i en innervegg mot et naborom, helst der veggen er lengst
      const opts = [];
      for (const s of sp) {
        const part = mine.filter(e => e[0] === s.k && e[3] && e[4]).map(g.ends).filter(p => Math.abs(p.c - s.c) < EPS && p.a >= s.a - EPS && p.b <= s.b + EPS).sort((p, q) => p.a - q.a);
        for (let i = 0; i < part.length;) { let j = i; while (part[j + 1] && Math.abs(part[j + 1].a - part[j].b) < EPS) j++; opts.push({ s, a: part[i].a, b: part[j].b }); i = j + 1; }
      }
      const door = opts.sort((p, q) => (q.b - q.a) - (p.b - p.a)).map(({ s, a, b }) => {
        const width = Math.min(.9, b - a - .3); if (width < .6) return null;
        const free = x => x - width / 2 >= Math.max(a, s.a + .1) && x + width / 2 <= Math.min(b, s.b - .1) && s.w.openings.every(o => Math.abs(absPos(s, o) - x) >= (o.width + width) / 2 + .1);
        const x = [(a + b) / 2, a + .15 + width / 2, b - .15 - width / 2].find(free);
        return x === undefined ? null : { s, o: { id: uid('o'), type: 'door', sill: 0, color: '#efece6', width: round(width), height: Math.min(2.1, round(f.height - .1)), pos: round(s.fwd ? x - s.a : s.b - x) } };
      }).find(Boolean);
      if (door) { door.s.w.openings.push(door.o); fix(`Satte inn en dør til «${r.name}», som ikke hadde noen inngang.`); }
      else bad(`Rommet «${r.name}» har ingen dør, og det var ikke plass til å sette inn en.`);
    }

    // 9. Møbler skal stå inne i et rom, med hele grunnflaten innenfor.
    let shifted = 0;
    for (const m of f.furniture) {
      if (!f.rooms.length) break;
      const t = m.rot * Math.PI / 180, hx = (Math.abs(Math.cos(t)) * m.w + Math.abs(Math.sin(t)) * m.d) / 2, hz = (Math.abs(Math.sin(t)) * m.w + Math.abs(Math.cos(t)) * m.d) / 2;
      const dist = r => Math.hypot(Math.max(r.x - m.x, 0, m.x - r.x - r.w), Math.max(r.z - m.z, 0, m.z - r.z - r.d));
      const r = [...f.rooms].sort((a, b) => dist(a) - dist(b))[0], gap = .05;
      const fit = (v, lo, len, half) => round(len < 2 * (half + gap) ? lo + len / 2 : Math.min(lo + len - half - gap, Math.max(lo + half + gap, v)));
      const x = fit(m.x, r.x, r.w, hx), z = fit(m.z, r.z, r.d, hz);
      if (Math.abs(x - m.x) > .01 || Math.abs(z - m.z) > .01) { m.x = x; m.z = z; shifted++; }
    }
    if (shifted) fix(`Flyttet ${plural(shifted, 'møbel', 'møbler')} som sto utenfor et rom eller gjennom en vegg.`);

    // 10. En etasje skal hvile på etasjen under.
    const me = bounds(f);
    if (below && me && (me.x0 < below.x0 - .5 || me.x1 > below.x1 + .5 || me.z0 < below.z0 - .5 || me.z1 > below.z1 + .5)) bad('Etasjen stikker utenfor etasjen under. Sjekk at grunnflatene stemmer.');
  });
  if (!house.roof) { house.roof = { type: 'gable', pitch: 30, overhang: .4, material: 'takstein', color: '#3a3a3c' }; fixed.push('Huset manglet tak og fikk et saltak.'); }
  return { house, fixed, problems };
}
