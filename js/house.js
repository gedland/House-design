// Husets JSON-skjema (versjon 1). Alle mål i meter, y er opp. Dette er det eneste formatet appen leser og skriver.
// {
//   version: 1, name,
//   floors: [{ id, name, height,
//     rooms:     [{ id, name, x, z, w, d, material, color }],            // x,z = hjørne, w = bredde (x), d = dybde (z); materiale/farge gjelder gulvet
//     walls:     [{ id, x1, z1, x2, z2, thickness, material, color,
//                   openings: [{ id, type: 'door'|'window', pos, width, height, sill, material, color }] }],  // pos = senter, målt fra (x1,z1); materiale = dørblad eller karm
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
export const OPENINGS = { door: { label: 'Dør', width: .9, height: 2.1, sill: 0, material: 'tre', color: '#5a3b26' }, window: { label: 'Vindu', width: 1.2, height: 1.2, sill: .9, material: 'maling', color: '#f2efe8' } };
export const ROOFS = { gable: 'Saltak', hip: 'Valmtak', flat: 'Flatt tak' };
export const uid = p => p + Math.random().toString(36).slice(2, 8);
export const round = v => Math.round(v * 1000) / 1000;

const P = '#e9e4d8', I = '#f1eee7', WF = '#f2efe8';
const win = (pos, width = 1.2, height = 1.2, sill = .9) => ({ type: 'window', pos, width, height, sill, material: 'maling', color: WF });
const door = (pos, color = '#efece6') => ({ type: 'door', pos, width: .9, height: 2.1, sill: 0, material: 'tre', color });
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
  w.x2 = round(w.x1 + Math.cos(a) * L); w.z2 = round(w.z1 + Math.sin(a) * L); fitOpenings(w);
}
// Holder åpningene innenfor veggen etter at den har endret lengde.
function fitOpenings(w) { const L = wallLength(w); for (const o of w.openings) o.pos = round(Math.min(Math.max(o.pos, Math.min(o.width, L) / 2), Math.max(L - o.width / 2, L / 2))); }
const EPS = .03;
// Alt som står på en rett linje i planen og må flytte seg sammen: romkanter, vegger langs linjen og veggender som støter mot den.
// k = aksen linjen flyttes langs ('x' eller 'z'), c = linjens posisjon, [a, b] = strekket langs linjen. Strekket vokser til det dekker hele rom og vegger.
function edgePlan(floor, k, c, a, b) {
  const o = k === 'x' ? 'z' : 'x', size = k === 'x' ? 'w' : 'd', osize = k === 'x' ? 'd' : 'w', on = v => Math.abs(v - c) < EPS, along = w => on(w[k + 1]) && on(w[k + 2]);
  const lo = new Set(), hi = new Set(), walls = new Set(), ends = [];
  for (let grown = true; grown;) {
    grown = false;
    for (const r of floor.rooms) {
      const isLo = on(r[k]), isHi = on(r[k] + r[size]);
      if ((!isLo && !isHi) || lo.has(r) || hi.has(r) || Math.min(b, r[o] + r[osize]) - Math.max(a, r[o]) <= EPS) continue;
      (isLo ? lo : hi).add(r); a = Math.min(a, r[o]); b = Math.max(b, r[o] + r[osize]); grown = true;
    }
    for (const w of floor.walls) {
      const w0 = Math.min(w[o + 1], w[o + 2]), w1 = Math.max(w[o + 1], w[o + 2]);
      if (!along(w) || walls.has(w) || Math.min(b, w1) - Math.max(a, w0) <= EPS) continue;
      walls.add(w); a = Math.min(a, w0); b = Math.max(b, w1); grown = true;
    }
  }
  let min = -Infinity, max = Infinity; // hvor langt linjen kan flyttes før et rom eller en vegg blir for liten
  for (const r of lo) max = Math.min(max, r[size] - .5);
  for (const r of hi) min = Math.max(min, .5 - r[size]);
  for (const w of floor.walls) if (!along(w)) for (const n of [1, 2]) if (on(w[k + n]) && w[o + n] >= a - EPS && w[o + n] <= b + EPS) {
    ends.push([w, n]); const far = w[k + (3 - n)] - c;
    if (Math.abs(w[o + 1] - w[o + 2]) < EPS) { if (far > 0) max = Math.min(max, far - .2); else min = Math.max(min, far + .2); }
  }
  return { k, size, lo, hi, walls, ends, min, max, attached: lo.size + hi.size + ends.length > 0 || walls.size > 1 };
}
function applyEdge(p, d) {
  d = round(Math.min(p.max, Math.max(p.min, d))); if (!d || p.min > p.max) return 0;
  for (const r of p.lo) { r[p.k] = round(r[p.k] + d); r[p.size] = round(r[p.size] - d); }
  for (const r of p.hi) r[p.size] = round(r[p.size] + d);
  for (const w of p.walls) for (const n of [1, 2]) w[p.k + n] = round(w[p.k + n] + d);
  for (const [w, n] of p.ends) { // veggen strekkes; åpningene blir stående der de er
    const L = wallLength(w); w[p.k + n] = round(w[p.k + n] + d);
    if (n === 1) for (const op of w.openings) op.pos = round(op.pos + wallLength(w) - L);
    fitOpenings(w);
  }
  return d;
}
const straight = w => Math.abs(w.z1 - w.z2) < EPS ? 'z' : Math.abs(w.x1 - w.x2) < EPS ? 'x' : null; // aksen en rett vegg flyttes langs
// Flytter en vegg. Henger den sammen med rom eller andre vegger, flyttes den på tvers, og rommene, naboveggene og dermed taket følger med.
export function moveWall(floor, w, dx, dz) {
  const k = straight(w), o = k === 'x' ? 'z' : 'x';
  const p = k && edgePlan(floor, k, w[k + 1], Math.min(w[o + 1], w[o + 2]), Math.max(w[o + 1], w[o + 2]));
  if (p?.attached) return applyEdge(p, k === 'x' ? dx : dz);
  w.x1 = round(w.x1 + dx); w.x2 = round(w.x2 + dx); w.z1 = round(w.z1 + dz); w.z2 = round(w.z2 + dz);
}
// Endrer lengden på en vegg. Står det en vegg eller romkant på tvers i enden, flyttes den, så hjørnet holder seg lukket.
export function setWallLength(floor, w, len) {
  const k = straight(w) === 'z' ? 'x' : straight(w) === 'x' ? 'z' : null, o = k === 'x' ? 'z' : 'x', L = wallLength(w);
  const p = k && edgePlan(floor, k, w[k + 2], w[o + 2] - .05, w[o + 2] + .05);
  if (p && (p.walls.size || p.lo.size || p.hi.size)) applyEdge(p, Math.sign(w[k + 2] - w[k + 1]) * (Math.max(.2, len) - L));
  else setWall(w, len, Math.atan2(w.z2 - w.z1, w.x2 - w.x1) * 180 / Math.PI);
}
// Ytterkanten av en etasje (vegger og rom), eller null når etasjen er tom.
export function bounds(floor) {
  const xs = [], zs = [];
  for (const w of floor.walls) { xs.push(w.x1, w.x2); zs.push(w.z1, w.z2); }
  for (const r of floor.rooms) { xs.push(r.x, r.x + r.w); zs.push(r.z, r.z + r.d); }
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } : null;
}
// Flytter eller endrer størrelse på et rom. Kantene flyttes som hele linjer: naborom, vegger og møblene i rommet følger med.
export function reshapeRoom(floor, room, next) {
  for (const [k, size, o, osize] of [['x', 'w', 'z', 'd'], ['z', 'd', 'x', 'w']]) {
    const plan = hiEdge => edgePlan(floor, k, room[k] + (hiEdge ? room[size] : 0), room[o], room[o] + room[osize]);
    if (next[size] !== undefined) applyEdge(plan(true), next[size] - room[size]);
    if (next[k] !== undefined) {
      const a = plan(false), b = plan(true), d = Math.min(a.max, b.max, Math.max(a.min, b.min, next[k] - room[k]));
      const inside = floor.furniture.filter(f => f.x >= room.x && f.x <= room.x + room.w && f.z >= room.z && f.z <= room.z + room.d);
      const moved = applyEdge(a, d); applyEdge(b, moved);
      for (const f of inside) f[k] = round(f[k] + moved);
    }
  }
}
// Sletter et rom med møblene i det og veggene som bare hører til dette rommet.
export function removeRoom(floor, room) {
  const edges = r => [['z', r.z, r.x, r.x + r.w], ['z', r.z + r.d, r.x, r.x + r.w], ['x', r.x, r.z, r.z + r.d], ['x', r.x + r.w, r.z, r.z + r.d]];
  const onEdge = (w, r) => edges(r).some(([k, c, a, b]) => { const o = k === 'x' ? 'z' : 'x'; return Math.abs(w[k + 1] - c) < EPS && Math.abs(w[k + 2] - c) < EPS && Math.min(w[o + 1], w[o + 2]) >= a - EPS && Math.max(w[o + 1], w[o + 2]) <= b + EPS; });
  floor.walls = floor.walls.filter(w => !onEdge(w, room) || floor.rooms.some(r => r !== room && onEdge(w, r)));
  floor.furniture = floor.furniture.filter(f => !(f.x >= room.x && f.x <= room.x + room.w && f.z >= room.z && f.z <= room.z + room.d));
  floor.rooms = floor.rooms.filter(r => r !== room);
}
