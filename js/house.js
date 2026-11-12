// Husets JSON-skjema (versjon 1). Alle mål i meter, y er opp. Dette er det eneste formatet appen leser og skriver.
// {
//   version: 1, name,
//   floors: [{ id, name, height,
//     rooms:     [{ id, name, x, z, w, d, material, color }],            // x,z = hjørne, w = bredde (x), d = dybde (z); materiale/farge gjelder gulvet
//     walls:     [{ id, x1, z1, x2, z2, thickness, material, color,
//                   openings: [{ id, type: 'door'|'window', pos, width, height, sill, color }] }],  // pos = senter, målt fra (x1,z1)
//     furniture: [{ id, type, x, z, rot, w, d, h, material, color }]     // x,z = senter, rot i grader
//   }],
//   roof: { type: 'gable'|'flat', pitch, overhang, material, color }
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
  plante: { label: 'Plante', w: .5, d: .5, h: 1.2, material: 'maling', color: '#4f7a4c' },
};
export const OPENINGS = { door: { label: 'Dør', width: .9, height: 2.1, sill: 0, color: '#5a3b26' }, window: { label: 'Vindu', width: 1.2, height: 1.2, sill: .9, color: '#f2efe8' } };
export const uid = p => p + Math.random().toString(36).slice(2, 8);
export const round = v => Math.round(v * 1000) / 1000;

export const DEMO = {
  version: 1, name: 'Demohus',
  floors: [{
    id: 'f1', name: '1. etasje', height: 2.4,
    rooms: [{ id: 'r1', name: 'Stue', x: 0, z: 0, w: 5, d: 4, material: 'tre', color: '#c8a57a' }],
    walls: [
      { id: 'w1', x1: 0, z1: 4, x2: 5, z2: 4, thickness: .2, material: 'panel', color: '#e9e4d8', openings: [
        { id: 'o1', type: 'door', pos: 1, width: .9, height: 2.1, sill: 0, color: '#5a3b26' },
        { id: 'o2', type: 'window', pos: 3.4, width: 1.6, height: 1.2, sill: .9, color: '#f2efe8' }] },
      { id: 'w2', x1: 5, z1: 4, x2: 5, z2: 0, thickness: .2, material: 'panel', color: '#e9e4d8', openings: [
        { id: 'o3', type: 'window', pos: 2, width: 1.4, height: 1.2, sill: .9, color: '#f2efe8' }] },
      { id: 'w3', x1: 5, z1: 0, x2: 0, z2: 0, thickness: .2, material: 'panel', color: '#e9e4d8', openings: [] },
      { id: 'w4', x1: 0, z1: 0, x2: 0, z2: 4, thickness: .2, material: 'panel', color: '#e9e4d8', openings: [] },
    ],
    furniture: [
      { id: 'm1', type: 'sofa', x: 2.5, z: .65, rot: 0, w: 2.1, d: .9, h: .8, material: 'tekstil', color: '#7d8a80' },
      { id: 'm2', type: 'bord', x: 2.5, z: 1.9, rot: 0, w: 1.2, d: .7, h: .45, material: 'tre', color: '#b08a5e' },
      { id: 'm3', type: 'skap', x: .4, z: 1.6, rot: 90, w: 1.2, d: .45, h: 1.9, material: 'tre', color: '#e6e1d6' },
      { id: 'm4', type: 'plante', x: 4.5, z: .5, rot: 0, w: .5, d: .5, h: 1.2, material: 'maling', color: '#4f7a4c' },
    ],
  }],
  roof: { type: 'gable', pitch: 30, overhang: .4, material: 'takstein', color: '#3a3a3c' },
};

// Finner et objekt i huset ut fra id, med listen det ligger i.
export function find(house, id) {
  let y = 0;
  for (const floor of house.floors) {
    for (const [key, kind] of [['rooms', 'room'], ['walls', 'wall'], ['furniture', 'furniture']]) {
      const item = floor[key].find(o => o.id === id);
      if (item) return { kind, item, list: floor[key], floor, y };
    }
    for (const wall of floor.walls) {
      const item = (wall.openings || []).find(o => o.id === id);
      if (item) return { kind: 'opening', item, list: wall.openings, floor, wall, y };
    }
    y += floor.height;
  }
  return null;
}
export const wallLength = w => Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
export function setWallLength(w, len) {
  const L = wallLength(w) || 1, k = Math.max(.2, len) / L;
  w.x2 = round(w.x1 + (w.x2 - w.x1) * k); w.z2 = round(w.z1 + (w.z2 - w.z1) * k);
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
