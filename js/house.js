// Husets JSON-skjema (versjon 1). Alle mål i meter, y er opp. Dette er det eneste formatet appen leser og skriver.
// {
//   version: 1, name,
//   floors: [{ id, name, height,
//     rooms:     [{ id, name, x, z, w, d, material, color }],            // x,z = hjørne, w = bredde (x), d = dybde (z); materiale/farge gjelder gulvet
//     walls:     [{ id, x1, z1, x2, z2, thickness, material, color,
//                   openings: [{ id, type: 'door'|'window', pos, width, height, sill, material, color }] }],  // pos = senter, målt fra (x1,z1); materiale/farge gjelder dørblad eller karm
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
  w.x2 = round(w.x1 + Math.cos(a) * L); w.z2 = round(w.z1 + Math.sin(a) * L);
}
// Ytterkanten av en etasje (vegger og rom), eller null når etasjen er tom.
export function bounds(floor) {
  const xs = [], zs = [];
  for (const w of floor.walls) { xs.push(w.x1, w.x2); zs.push(w.z1, w.z2); }
  for (const r of floor.rooms) { xs.push(r.x, r.x + r.w); zs.push(r.z, r.z + r.d); }
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } : null;
}

// Redigering der naboene følger med. E = hvor nær to punkter må ligge for å regnes som sammenkoblet.
const E = .03;
const dir = w => { const L = wallLength(w) || 1; return [(w.x2 - w.x1) / L, (w.z2 - w.z1) / L]; };
const onWall = (w, x, z) => { const [ux, uz] = dir(w), t = (x - w.x1) * ux + (z - w.z1) * uz; return t > -E && t < wallLength(w) + E && Math.abs((x - w.x1) * uz - (z - w.z1) * ux) < E; };
const parallel = (a, b) => { const [ax, az] = dir(a), [bx, bz] = dir(b); return Math.abs(ax * bz - az * bx) < .05; };
const axis = w => Math.abs(w.x1 - w.x2) < E ? 'x' : Math.abs(w.z1 - w.z2) < E ? 'z' : null; // 'x' = veggen står på en fast x (går langs z)
const span = (w, ax) => ax === 'x' ? [Math.min(w.z1, w.z2), Math.max(w.z1, w.z2)] : [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)];
const rect = (r, ax) => ax === 'x' ? [r.x, r.w, r.z, r.d] : [r.z, r.d, r.x, r.w]; // [kant, størrelse, start på tvers, lengde på tvers]
// Rom med en kant på linjen ax = c mellom a og b. side 0 = rommets start ligger på linjen, 1 = rommets slutt.
function edgeRooms(floor, ax, c, a, b) {
  const out = [];
  for (const r of floor.rooms) {
    const [p, s, q, t] = rect(r, ax);
    if (Math.min(b, q + t) - Math.max(a, q) < E) continue;
    if (Math.abs(p - c) < E) out.push([r, 0]); else if (Math.abs(p + s - c) < E) out.push([r, 1]);
  }
  return out;
}
// Flytter romkantene med v, men aldri så langt at et rom blir smalere enn 0,5 m. Møbler som havner utenfor skyves inn igjen.
function slideRooms(floor, sides, ax, v) {
  for (const [r, side] of sides) { const s = rect(r, ax)[1] - .5; v = side ? Math.max(v, -s) : Math.min(v, s); }
  if (!v) return 0;
  const [k, m] = ax === 'x' ? ['x', 'w'] : ['z', 'd'];
  for (const [r, side] of sides) {
    const items = floor.furniture.filter(f => f.x >= r.x && f.x <= r.x + r.w && f.z >= r.z && f.z <= r.z + r.d);
    if (side) r[m] = round(r[m] + v); else { r[k] = round(r[k] + v); r[m] = round(r[m] - v); }
    for (const f of items) f[k] = round(Math.min(r[k] + r[m] - .1, Math.max(r[k] + .1, f[k])));
  }
  return v;
}
// Holder dører og vinduer innenfor veggen (og under taket når H er gitt).
export function fitOpenings(wall, H) {
  const L = wallLength(wall);
  for (const o of wall.openings) {
    o.width = round(Math.max(.3, Math.min(o.width, L - .2)));
    o.pos = round(Math.max(o.width / 2 + .1, Math.min(L - o.width / 2 - .1, o.pos)));
    if (H) { o.sill = round(Math.max(0, Math.min(o.sill, H - .4))); o.height = round(Math.max(.3, Math.min(o.height, H - o.sill))); }
  }
}
// Flytter en vegg. Vegger som ender på den forlenges eller kortes inn, rom langs den følger kanten, og åpninger i
// naboveggene blir stående der de sto. En vegg som henger sammen med noe, flyttes bare på tvers. Gir flyttingen som ble gjort.
export function shiftWall(floor, wall, dx, dz) {
  const [ux, uz] = dir(wall), others = floor.walls.filter(w => w !== wall && !parallel(w, wall)), ax = axis(wall);
  const ends = others.flatMap(w => [1, 2].filter(k => onWall(wall, w['x' + k], w['z' + k])).map(k => [w, k]));
  const sides = ax ? edgeRooms(floor, ax, wall[ax + 1], ...span(wall, ax)) : [];
  if (ends.length || sides.length || others.some(w => onWall(w, wall.x1, wall.z1) || onWall(w, wall.x2, wall.z2))) {
    if (ax === 'x') dz = 0; else if (ax === 'z') dx = 0; else { const s = dz * ux - dx * uz; dx = -uz * s; dz = ux * s; }
  }
  if (sides.length) { const v = slideRooms(floor, sides, ax, ax === 'x' ? dx : dz); if (ax === 'x') dx = v; else dz = v; }
  dx = round(dx); dz = round(dz);
  if (!dx && !dz) return [0, 0];
  for (const [w, k] of ends) {
    const L = wallLength(w); w['x' + k] = round(w['x' + k] + dx); w['z' + k] = round(w['z' + k] + dz);
    if (k === 1) for (const o of w.openings) o.pos = round(o.pos + wallLength(w) - L);
    fitOpenings(w);
  }
  wall.x1 = round(wall.x1 + dx); wall.x2 = round(wall.x2 + dx); wall.z1 = round(wall.z1 + dz); wall.z2 = round(wall.z2 + dz);
  return [dx, dz];
}
// Endrer lengden på en vegg. Ender den i en annen vegg, flyttes den veggen med, ellers flyttes bare sluttpunktet.
export function setWallLength(floor, w, len) {
  const d = Math.max(.2, len) - wallLength(w), [ux, uz] = dir(w);
  const n = floor.walls.find(o => o !== w && !parallel(o, w) && onWall(o, w.x2, w.z2));
  if (n) shiftWall(floor, n, ux * d, uz * d); else setWall(w, len, Math.atan2(uz, ux) * 180 / Math.PI);
  fitOpenings(w);
}
// Flytter én kant av et rom. Står det vegger på kanten, er det de som flyttes (og tar rommene med seg).
function moveEdge(floor, room, ax, side, v) {
  const [p, s, q, t] = rect(room, ax), c = side ? p + s : p;
  const walls = floor.walls.filter(w => axis(w) === ax && Math.abs(w[ax + 1] - c) < E && Math.min(q + t, span(w, ax)[1]) - Math.max(q, span(w, ax)[0]) > E);
  for (const w of walls) shiftWall(floor, w, ax === 'x' ? v : 0, ax === 'x' ? 0 : v);
  if (!walls.length) slideRooms(floor, edgeRooms(floor, ax, c, q, q + t), ax, v);
  const [p2, s2] = rect(room, ax); return (side ? p2 + s2 : p2) - c;
}
// Flytter eller endrer størrelse på et rom. Veggene rundt følger med, og naborommene gir plass, så planen forblir tett.
export function reshapeRoom(floor, room, next) {
  const n = { x: room.x, z: room.z, w: room.w, d: room.d, ...next };
  for (const [ax, m] of [['x', 'w'], ['z', 'd']]) {
    const v0 = n[ax] - room[ax], v1 = n[ax] + Math.max(.5, n[m]) - room[ax] - room[m], items = floor.furniture.filter(f => f.x > room.x && f.x < room.x + room.w && f.z > room.z && f.z < room.z + room.d).map(f => [f, f[ax]]);
    if (Math.abs(v0 - v1) < 1e-6) { // ren flytting: den fremre kanten først, så den bakre like langt. Møblene i rommet blir med.
      if (!v0) continue;
      const got = moveEdge(floor, room, ax, v0 > 0 ? 1 : 0, v0); moveEdge(floor, room, ax, v0 > 0 ? 0 : 1, got);
      for (const [f, at] of items) f[ax] = round(Math.min(room[ax] + room[m] - .1, Math.max(room[ax] + .1, at + got)));
    } else { if (v1) moveEdge(floor, room, ax, 1, v1); if (v0) moveEdge(floor, room, ax, 0, v0); }
  }
}
// Sletter et rom med møblene som står i det og veggene som bare hører til dette rommet.
export function removeRoom(floor, room) {
  const own = w => { const ax = axis(w); if (!ax) return false; const [p, s, q, t] = rect(room, ax), [a, b] = span(w, ax), c = w[ax + 1];
    return (Math.abs(c - p) < E || Math.abs(c - p - s) < E) && a > q - E && b < q + t + E && edgeRooms(floor, ax, c, a, b).every(([r]) => r === room); };
  floor.walls = floor.walls.filter(w => !own(w));
  floor.furniture = floor.furniture.filter(f => !(f.x > room.x && f.x < room.x + room.w && f.z > room.z && f.z < room.z + room.d));
  floor.rooms = floor.rooms.filter(r => r !== room);
}
