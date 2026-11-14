// Tegner husets JSON som Three.js-objekter. Hvert rom, vegg, åpning og møbel er et eget objekt med userData.id.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS, bounds } from './house.js';

const PATTERNS = { // 256 px = 1 m, lyse mønstre som fargen ganges inn i
  tre(x) { for (let r = 0; r < 8; r++) { x.fillStyle = `hsl(0 0% ${88 + (r * 37 % 5) * 3}%)`; x.fillRect(0, r * 32, 256, 32); line(x, 0, r * 32, 256, r * 32); const j = r * 97 % 256; line(x, j, r * 32, j, r * 32 + 32); } },
  panel(x) { for (let c = 0; c < 8; c++) { x.fillStyle = `hsl(0 0% ${92 + (c * 53 % 4) * 2}%)`; x.fillRect(c * 32, 0, 32, 256); line(x, c * 32, 0, c * 32, 256); } },
  flis(x) { for (let i = 0; i < 4; i++) { line(x, i * 64, 0, i * 64, 256); line(x, 0, i * 64, 256, i * 64); } },
  murstein(x) { for (let r = 0; r < 16; r++) { line(x, 0, r * 16, 256, r * 16); for (let c = 0; c < 4; c++) { const px = c * 64 + (r % 2) * 32; line(x, px, r * 16, px, r * 16 + 16); } } },
  takstein(x) { for (let r = 0; r < 4; r++) { line(x, 0, r * 64, 256, r * 64); for (let c = 0; c < 8; c++) { const px = c * 32 + (r % 2) * 16; line(x, px, r * 64, px, r * 64 + 64); } } },
  betong(x) { for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${(i * 7919 % 10) / 120})`; x.fillRect(i * 7919 % 256, i * 104729 % 256, 2, 2); } },
};
const line = (x, a, b, c, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
const texCache = {}, matCache = {};
function texture(kind) {
  if (kind in texCache) return texCache[kind];
  if (!PATTERNS[kind]) return texCache[kind] = null;
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 2; PATTERNS[kind](x);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return texCache[kind] = t;
}
function mat(material, color) {
  const key = material + color;
  if (matCache[key]) return matCache[key];
  const m = MATERIALS[material] || MATERIALS.maling;
  return matCache[key] = material === 'glass'
    ? new THREE.MeshStandardMaterial({ color, roughness: .1, transparent: true, opacity: .35 })
    : new THREE.MeshStandardMaterial({ color, roughness: m.rough, metalness: m.metal || 0, map: texture(material) });
}
const shade = (color, k) => '#' + new THREE.Color(color).multiplyScalar(k).getHexString();
// Boks med UV i meter, så mønstrene får riktig målestokk uansett størrelse.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * dims[f][0], uv.getY(f * 4 + i) * dims[f][1]);
  return g;
}
// x,z = senter, y = underkant
function box(parent, w, h, d, x, y, z, material) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function tag(obj, id, kind, name) { obj.userData = { id, kind }; obj.name = name || kind; return obj; }

// lift = hvor mye gulvet ligger over veggtoppene i etasjen under, så de to flatene ikke havner i samme plan.
function buildRoom(r, lift = 0) {
  const g = tag(new THREE.Group(), r.id, 'room', r.name);
  box(g, r.w, .15 + lift, r.d, r.x + r.w / 2, -.15, r.z + r.d / 2, mat(r.material, r.color));
  return g;
}
// Hvor mye hver veggende forlenges (+) eller kortes (-) så hjørner og T-kryss lukkes uten at veggene overlapper.
// Rette hjørner: den tykkeste veggen går helt ut, den andre butter mot den. T-kryss: veggen stopper mot flaten på den gjennomgående.
function joints(walls) {
  const e = .02, info = walls.map(w => { const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz) || 1; return { t: w.thickness, x: w.x1, z: w.z1, L, ux: dx / L, uz: dz / L }; });
  return info.map((A, ia) => [0, 1].map(end => {
    const px = end ? A.x + A.ux * A.L : A.x, pz = end ? A.z + A.uz * A.L : A.z, ox = end ? A.ux : -A.ux, oz = end ? A.uz : -A.uz;
    let through = 0, straight = false, skew = false, corner = null, sides = 0;
    info.forEach((B, ib) => {
      if (ib === ia) return;
      const rx = px - B.x, rz = pz - B.z, along = rx * B.ux + rz * B.uz;
      if (Math.abs(rx * B.uz - rz * B.ux) > e || along < -e || along > B.L + e) return;
      const dot = ox * B.ux + oz * B.uz, dir = along < e ? 1 : along > B.L - e ? -1 : 0; // dir: retningen B fortsetter fra punktet, 0 = B går forbi
      if (Math.abs(dot) < .05) {
        if (!dir) through = Math.max(through, B.t);
        else { sides |= (ox * B.uz - oz * B.ux) * dir > 0 ? 1 : 2; if (!corner || B.t > corner.t) corner = { t: B.t, ib }; }
      } else if (Math.abs(dot) > .998) { if (dir && dot * dir > 0) straight = true; }
      else skew = true;
    });
    if (sides === 3) through = Math.max(through, corner.t);
    if (through) return -through / 2;
    if (straight) return 0;
    if (corner) return (A.t > corner.t || (A.t === corner.t && ia < corner.ib) ? 1 : -1) * corner.t / 2;
    return skew ? A.t / 2 : 0;
  }));
}
// base = hvor langt veggen går ned forbi gulvet (nederste etasje dekker kanten av gulvplaten).
function buildWall(w, H, [e0, e1] = [0, 0], base = 0) {
  const g = tag(new THREE.Group(), w.id, 'wall', 'Vegg'), dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz), t = w.thickness, m = mat(w.material, w.color);
  g.position.set(w.x1, 0, w.z1); g.rotation.y = -Math.atan2(dz, dx);
  let at = -e0; const end = L + e1;
  const solid = (a, b, y0, y1) => box(g, b - a, y1 - y0, t, (a + b) / 2, y0, 0, m);
  for (const o of [...(w.openings || [])].sort((a, b) => a.pos - b.pos)) {
    const a = Math.max(at, o.pos - o.width / 2), b = Math.min(end, o.pos + o.width / 2), sill = Math.min(o.sill, H - .3), top = Math.min(H, sill + o.height);
    if (b - a < .05) continue;
    solid(at, a, -base, H); solid(a, b, sill ? -base : 0, sill); solid(a, b, top, H); at = b;
    const og = tag(new THREE.Group(), o.id, 'opening', o.type === 'door' ? 'Dør' : 'Vindu'), ww = b - a, hh = top - sill, f = .06, fm = mat('maling', o.color);
    og.position.set((a + b) / 2, sill, 0);
    if (o.type === 'door') { box(og, ww, hh, .05, 0, 0, 0, mat('tre', o.color)); box(og, .03, .12, .12, ww / 2 - .1, Math.min(1, hh / 2), 0, mat('metall', '#b9b9b4')); }
    else {
      box(og, ww - f, hh - f, .02, 0, f / 2, 0, mat('glass', '#bcd7e6'));
      box(og, ww, f, t + .02, 0, 0, 0, fm); box(og, ww, f, t + .02, 0, hh - f, 0, fm);
      box(og, f, hh - f * 2, t + .02, -ww / 2 + f / 2, f, 0, fm); box(og, f, hh - f * 2, t + .02, ww / 2 - f / 2, f, 0, fm);
      if (ww > 1) box(og, f * .7, hh - f * 2, .05, 0, f, 0, fm);
    }
    g.add(og);
  }
  solid(at, end, -base, H);
  return g;
}
const PARTS = { // deler: [w, h, d, x, y, z, fargefaktor eller fast farge]
  sofa: (w, d, h) => [[w, h * .5, d, 0, 0, 0], [w, h * .5, d * .25, 0, h * .5, -d * .375, .9], [w * .1, h * .25, d * .75, -w * .45, h * .5, d * .125, .9], [w * .1, h * .25, d * .75, w * .45, h * .5, d * .125, .9]],
  bord: (w, d, h) => [[w, .05, d, 0, h - .05, 0], ...legs(w, d, h - .05, .06)],
  stol: (w, d, h) => [[w, .05, d, 0, h * .5, 0], [w, h * .45, .05, 0, h * .5 + .05, -d / 2 + .025], ...legs(w, d, h * .5, .04)],
  seng: (w, d, h) => [[w, h * .3, d, 0, 0, 0, .7], [w * .96, h * .25, d * .97, 0, h * .3, d * .01], [w, h * .7, .08, 0, h * .3, -d / 2 + .04, .7], [w * .8, .1, .45, 0, h * .55, -d / 2 + .4, '#f4f1ea']],
  skap: (w, d, h) => [[w, h, d, 0, 0, 0], [.02, h * .9, .02, 0, h * .05, d / 2 + .01, .6]],
  kjokken: (w, d, h) => [[w, h - .04, d - .03, 0, 0, -.015], [w, .04, d, 0, h - .04, 0, '#3f3d3a'], [Math.min(.6, w * .3), .02, d * .6, -w * .25, h, 0, '#b9bcbd']],
  tv: (w, d, h) => [[w, h * .35, d, 0, 0, 0], [w * .85, h * .5, .04, 0, h * .45, 0, '#161616'], [.2, h * .1, .1, 0, h * .35, 0, '#161616']],
  toalett: (w, d, h) => [[w, h * .5, d * .65, 0, 0, d * .175], [w, h, d * .35, 0, 0, -d * .325, .95]],
  vask: (w, d, h) => [[w, h - .12, d, 0, 0, 0], [w, .12, d, 0, h - .12, 0, '#f6f5f2'], [.04, .15, .04, 0, h, -d * .3, '#b9bcbd']],
  dusj: (w, d, h) => [[w, .06, d, 0, 0, 0], [.03, h - .06, d - .03, -w / 2 + .015, .06, -.015, 'glass'], [w, h - .06, .03, 0, .06, d / 2 - .015, 'glass'], [.04, h * .95, .04, w / 2 - .1, 0, -d / 2 + .1, '#b9bcbd']],
  lampe: (w, d, h) => [[w * .6, .03, d * .6, 0, 0, 0, .5], [.03, h * .8, .03, 0, 0, 0, .5], [w, h * .2, d, 0, h * .8, 0]],
  plante: (w, d, h) => [[w * .6, h * .3, d * .6, 0, 0, 0, '#b8a691'], [w, h * .6, d, 0, h * .4, 0], [.05, h * .12, .05, 0, h * .3, 0, '#5b4632']],
};
const legs = (w, d, h, s) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [s, h, s, a * (w / 2 - s), 0, b * (d / 2 - s), .75]);
function buildFurniture(f) {
  const g = tag(new THREE.Group(), f.id, 'furniture', f.type);
  g.position.set(f.x, 0, f.z); g.rotation.y = -(f.rot || 0) * Math.PI / 180;
  for (const [w, h, d, x, y, z, c] of (PARTS[f.type] || ((w, d, h) => [[w, h, d, 0, 0, 0]]))(f.w, f.d, f.h))
    box(g, w, h, d, x, y, z, c === 'glass' ? mat('glass', '#bcd7e6') : mat(f.material, typeof c === 'string' ? c : c ? shade(f.color, c) : f.color));
  return g;
}
// Flater (mangekanter i verdenskoordinater) → ett mesh. UV legges i flatens eget plan i meter, så mønstrene følger takfallet.
function surface(parent, faces, material) {
  const pos = [], nor = [], uv = [], n = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (let [pts, out] of faces) {
    n.set(0, 0, 0);
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; n.x += (p[1] - q[1]) * (p[2] + q[2]); n.y += (p[2] - q[2]) * (p[0] + q[0]); n.z += (p[0] - q[0]) * (p[1] + q[1]); });
    if (n.length() < 1e-7) continue;
    n.normalize();
    if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) { pts = [...pts].reverse(); n.negate(); }
    if (Math.abs(n.y) > .999) T.set(1, 0, 0); else T.crossVectors(Y, n).normalize();
    B.crossVectors(n, T);
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) {
      pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); uv.push(p[0] * T.x + p[1] * T.y + p[2] * T.z, p[0] * B.x + p[1] * B.y + p[2] * B.z);
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
}
// Beholder den delen av en konveks mangekant [u, v] der a·u + b·v + c ≥ 0.
function clip(P, a, b, c) {
  const out = [];
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length], dp = a * p[0] + b * p[1] + c, dq = a * q[0] + b * q[1] + c;
    if (dp >= 0) out.push(p);
    if ((dp < 0) !== (dq < 0)) { const k = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  });
  return out;
}
// Grunnflaten til hver etasje (rommene, eller ytterkanten når etasjen mangler rom) på et felles rutenett.
function layout(house) {
  const c = v => Math.round(v * 100) / 100;
  const rects = house.floors.map(f => f.rooms.length ? f.rooms.map(r => [c(r.x), c(r.z), c(r.x + r.w), c(r.z + r.d)]) : [bounds(f)].filter(Boolean).map(b => [c(b.x0), c(b.z0), c(b.x1), c(b.z1)]));
  const axis = k => [...new Set(rects.flat().flatMap(r => [r[k], r[k + 2]]))].sort((a, b) => a - b);
  const xs = axis(0), zs = axis(1), nx = Math.max(0, xs.length - 1), nz = Math.max(0, zs.length - 1);
  const inside = rects.map(rs => {
    const g = new Uint8Array(nx * nz);
    for (const r of rs) for (let i = 0; i < nx; i++) if (xs[i] >= r[0] && xs[i + 1] <= r[2]) for (let j = 0; j < nz; j++) if (zs[j] >= r[1] && zs[j + 1] <= r[3]) g[i * nz + j] = 1;
    return g;
  });
  return { xs, zs, nx, nz, inside };
}
// Deler et område i rutenettet i rektangler, størst først. Det største blir hovedkroppen, resten blir fløyer.
function split(grid, { xs, zs, nx, nz }) {
  const g = grid.slice(), out = [];
  for (;;) {
    let best = null;
    for (let i0 = 0; i0 < nx; i0++) for (let j0 = 0; j0 < nz; j0++) for (let i1 = i0, jmax = nz; i1 < nx; i1++) {
      let j = j0; while (j < jmax && g[i1 * nz + j]) j++;
      if ((jmax = j) === j0) break;
      const area = (xs[i1 + 1] - xs[i0]) * (zs[jmax] - zs[j0]);
      if (!best || area > best.area + 1e-9) best = { i0, i1: i1 + 1, j0, j1: jmax, area };
    }
    if (!best) return out;
    for (let i = best.i0; i < best.i1; i++) for (let j = best.j0; j < best.j1; j++) g[i * nz + j] = 0;
    out.push(Object.assign(best, { x0: xs[best.i0], x1: xs[best.i1], z0: zs[best.j0], z1: zs[best.j1] }));
  }
}
// Tak og himling over alt som ikke har en etasje over seg: øverste etasje, og lavere fløyer som stikker ut.
// Taket følger grunnflaten. Hver fløy får sitt eget tak, og en fløy som står vinkelrett på hovedkroppen får møne inn i hovedtaket.
// upTo = etasjen som vises (da tegnes bare takene under den), null = hele huset.
function buildRoof(house, upTo) {
  const r = house.roof; if (!r) return null;
  const G = layout(house), { xs, zs, nx, nz, inside } = G, cell = (g, i, j) => i >= 0 && j >= 0 && i < nx && j < nz && g[i * nz + j];
  const into = .02, group = tag(new THREE.Group(), 'roof', 'roof', 'Tak'), flat = r.type === 'flat', hip = r.type === 'hip', a = r.pitch * Math.PI / 180;
  const k = flat ? 0 : Math.tan(a), thick = flat ? .2 : .14 / Math.cos(a), o = r.overhang, sink = .02, range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  let y = 0;
  house.floors.forEach((floor, f) => {
    y += floor.height;
    if (upTo !== null && f >= upTo) return;
    const above = new Uint8Array(nx * nz); inside.slice(f + 1).forEach(g => g.forEach((v, c) => { if (v) above[c] = 1; }));
    const parts = split(inside[f].map((v, c) => v && !inside[f + 1]?.[c] ? 1 : 0), G), owner = new Int16Array(nx * nz).fill(-1);
    parts.forEach((p, n) => { for (let i = p.i0; i < p.i1; i++) for (let j = p.j0; j < p.j1; j++) owner[i * nz + j] = n; });
    const kind = ([i, j]) => cell(above, i, j) ? 'up' : cell(inside[f], i, j) ? 'in' : 'free'; // det som ligger utenfor en kant: høyere etasje, tak i samme høyde, eller friluft
    const outer = floor.walls.reduce((m, w) => w.thickness > (m?.thickness ?? 0) ? w : m, null), t = outer?.thickness ?? .2;
    const roofFaces = [], gableFaces = [];
    parts.forEach((p, n) => {
      const W = p.x1 - p.x0, D = p.z1 - p.z0;
      const edge = { z0: range(p.i0, p.i1).map(i => [i, p.j0 - 1]), z1: range(p.i0, p.i1).map(i => [i, p.j1]), x0: range(p.j0, p.j1).map(j => [p.i0 - 1, j]), x1: range(p.j0, p.j1).map(j => [p.i1, j]) };
      box(group, W, .08, D, (p.x0 + p.x1) / 2, y - .1, (p.z0 + p.z1) / 2, mat('maling', '#f4f2ec'));
      p.axis = W >= D ? 'x' : 'z'; p.kinds = Object.fromEntries(Object.entries(edge).map(([side, cells]) => [side, cells.map(kind)]));
      const all = (side, v) => p.kinds[side].every(x => x === v), upX = all('x0', 'up') || all('x1', 'up'), upZ = all('z0', 'up') || all('z1', 'up');
      // Lavere del inntil en høyere vegg: mønet går rett inn mot veggen, så sant taket da ikke rager opp over etasjen innenfor.
      if (upX !== upZ && ((upX ? D : W) / 2 + t / 2) * k <= house.floors[f + 1].height * .75) p.axis = upX ? 'x' : 'z';
      if (!flat) for (const side of ['z0', 'z1', 'x0', 'x1']) { // fløy inntil en større del på samme høyde: mønet går inn i taket på den
        const runs = side[0] === 'z' ? 'x' : 'z', len = runs === 'x' ? W : D, own = edge[side].map((c, m) => p.kinds[side][m] === 'in' ? owner[c[0] * nz + c[1]] : -1), q = parts[own[0]];
        if (!q || own[0] > n || own.some(v => v !== own[0]) || q.span < len) continue;
        const qSide = side[0] + (side[1] === '0' ? 1 : 0); // kanten på den store delen som vender mot fløyen
        if (q.axis === runs) p.ext = [side, q.span / 2]; // mot langsiden: inn til mønet
        else if (hip && !q.kinds[qSide].includes('up')) p.ext = [side, len / 2 + t / 2]; // mot en valmet ende: inn til valmflaten
        else continue;
        p.axis = side[0]; break;
      }
      const ax = p.axis === 'x'; p.span = ax ? D : W;
      // Lokale koordinater: v langs mønet, u på tvers (0 = mønet), h opp.
      const [eA, eB, sL, sR] = ax ? ['x0', 'x1', 'z0', 'z1'] : ['z0', 'z1', 'x0', 'x1'], c0 = ax ? p.x0 : p.z0, c1 = ax ? p.x1 : p.z1, uc = ax ? (p.z0 + p.z1) / 2 : (p.x0 + p.x1) / 2;
      const M = (u, v, h) => ax ? [v, h, uc + u] : [uc + u, h, v], dir = (du, dv) => ax ? [dv, 0, du] : [du, 0, dv];
      const ends = [eA, eB].map(side => { const ks = p.kinds[side], free = ks.every(x => x === 'free'); return { free, up: ks.every(x => x === 'up'), ext: p.ext?.[0] === side ? p.ext[1] : 0, hip: hip && !ks.includes('up') && p.ext?.[0] !== side, o: free ? o : 0, out: free ? t / 2 + o : ks.includes('up') ? into : t / 2 }; });
      const [A, B] = ends, s = p.span / 2 + t / 2, sA = s + A.o, sB = s + B.o, vA = c0 - t / 2 - A.o, vB = c1 + t / 2 + B.o, ridge = y - sink + s * k;
      const top = (u, v) => ridge + thick - k * Math.max(Math.abs(u), A.hip ? sA - (v - vA) : 0, B.hip ? sB - (vB - v) : 0);
      // Stykker langs mønet. Takutstikket tas bare med der kanten vender ut mot friluft.
      const edgeAt = kind => p.span / 2 + (kind === 'free' ? t / 2 + o : kind === 'up' ? into : t / 2);
      const cuts = ax ? xs.slice(p.i0, p.i1 + 1) : zs.slice(p.j0, p.j1 + 1), fl = p.kinds[sL], fr = p.kinds[sR];
      const pieces = cuts.slice(0, -1).map((v0, m) => ({ v0, v1: cuts[m + 1], uL: -edgeAt(fl[m]), uR: edgeAt(fr[m]) }));
      for (let m = pieces.length - 1; m > 0; m--) if (pieces[m].uL === pieces[m - 1].uL && pieces[m].uR === pieces[m - 1].uR) { pieces[m - 1].v1 = pieces[m].v1; pieces.splice(m, 1); }
      pieces[0].v0 = A.ext ? c0 : c0 - A.out; pieces.at(-1).v1 = B.ext ? c1 : c1 + B.out;
      const se = p.span / 2 - .01; // forlengelsen inn i nabotaket er litt smalere, så den ikke ligger i plan med naboens gavl
      if (A.ext) pieces.unshift({ v0: c0 - A.ext, v1: c0, uL: -se, uR: se });
      if (B.ext) pieces.push({ v0: c1, v1: c1 + B.ext, uL: -se, uR: se });
      const eq = (a, b) => Math.abs(a - b) < 1e-6;
      for (const q of pieces) {
        const rect = (a, b) => [[a, q.v0], [b, q.v0], [b, q.v1], [a, q.v1]];
        const polys = flat ? [rect(q.uL, q.uR)] : [-1, 1].map(sg => {
          let P = sg < 0 ? rect(q.uL, 0) : rect(0, q.uR);
          if (A.hip) P = clip(P, sg, 1, -sA - vA);
          if (B.hip) P = clip(P, sg, -1, vB - sB);
          return P;
        });
        if (A.hip) polys.push(clip(clip(rect(q.uL, q.uR), 1, -1, sA + vA), -1, -1, sA + vA));
        if (B.hip) polys.push(clip(clip(rect(q.uL, q.uR), 1, 1, sB - vB), -1, 1, sB - vB));
        for (const P of polys) if (P.length > 2) {
          const up = P.map(([u, v]) => M(u, v, top(u, v))), down = up.map(([x, h, z]) => [x, h - thick, z]);
          roofFaces.push([up, [0, 1, 0]], [down, [0, -1, 0]]);
          P.forEach((a, m) => { // kantbord der flaten ender
            const m2 = (m + 1) % P.length, b = P[m2];
            const d = eq(a[0], b[0]) && (eq(a[0], q.uL) ? dir(-1, 0) : eq(a[0], q.uR) && dir(1, 0)) || eq(a[1], b[1]) && (eq(a[1], q.v0) ? dir(0, -1) : eq(a[1], q.v1) && dir(0, 1));
            if (d) roofFaces.push([[up[m], up[m2], down[m2], down[m]], d]);
          });
        }
      }
      // Gavltrekanten mellom veggen og saltaket
      if (!flat) [[A, c0, -1], [B, c1, 1]].forEach(([e, c, sg]) => {
        if (e.hip || e.ext || e.up) return;
        const tri = v => [[-s, y], [s, y], [s, y + .01], [0, ridge + .03], [-s, y + .01]].map(([u, h]) => M(u, v, h));
        gableFaces.push([tri(c + sg * t / 2), dir(0, sg)], [tri(c - sg * t / 2), dir(0, -sg)]);
      });
    });
    surface(group, roofFaces, mat(r.material, r.color));
    surface(group, gableFaces, mat(outer?.material || 'panel', outer?.color || '#e9e4d8'));
  });
  return group.children.length ? group : null;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .05, 300);
  const root = new THREE.Group(); root.name = 'Hus'; scene.add(root);
  const fill = new THREE.AmbientLight('#ffffff', 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8578', 1.5), fill);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 90 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; ground.receiveShadow = true; scene.add(ground);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = 1; controls.maxDistance = 90;
  let dirty = true, byId = {}, lit = [], inset = [0, 0], last = 0;
  const walk = { on: false, yaw: 0, pitch: 0, move: [0, 0], saved: null };
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);

  function theme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    scene.background = new THREE.Color(dark ? '#1c1b19' : '#dfe8ee'); ground.material.color.set(dark ? '#2b2e2a' : '#b9c2ad'); invalidate();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.setViewOffset(w, h, inset[0] / 2, inset[1] / 2, w, h); invalidate();
  }
  // Flytter bildet så huset står midt i den delen av skjermen som panelet ikke dekker.
  function setInset(right, bottom) { if (right === inset[0] && bottom === inset[1]) return; inset = [right, bottom]; resize(); }
  new ResizeObserver(resize).observe(canvas);
  (function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    if (walk.on) {
      const [mx, mz] = walk.move;
      if (mx || mz) {
        const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw), v = 2.4 * dt;
        camera.position.x += (mx * c - mz * s) * v; camera.position.z += (-mx * s - mz * c) * v; dirty = true;
      }
      camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
    }
    if (dirty) { dirty = false; renderer.render(scene, camera); }
  })(0);

  // floor = null viser hele huset med tak. Et tall viser etasjene til og med den, uten tak, så du ser ned i rommene.
  function build(house, { floor = null } = {}) {
    root.traverse(o => o.geometry?.dispose()); lit.forEach(m => m.dispose()); lit = []; root.clear(); byId = {};
    let y = 0;
    for (const [i, f] of house.floors.entries()) {
      if (floor === null || i <= floor) {
        const g = new THREE.Group(), ends = joints(f.walls); g.name = f.name; g.position.y = y;
        for (const r of f.rooms) g.add(buildRoom(r, i ? .004 : 0));
        f.walls.forEach((w, n) => g.add(buildWall(w, f.height, ends[n], i ? 0 : .14)));
        for (const m of f.furniture) g.add(buildFurniture(m));
        root.add(g);
      }
      y += f.height;
    }
    const roof = buildRoof(house, floor); if (roof) root.add(roof);
    root.traverse(o => { if (o.userData.id) byId[o.userData.id] = o; });
    invalidate();
  }
  function select(id) {
    const o = byId[id]; if (!o) return;
    o.traverse(m => {
      if (!m.isMesh || (id !== m.parent.userData.id && m.parent.userData.kind === 'opening')) return;
      m.material = m.material.clone(); m.material.emissive.set('#2f8f6b'); m.material.emissiveIntensity = .45; lit.push(m.material);
    });
    invalidate();
  }
  function frame() {
    if (walk.on) return;
    const b = new THREE.Box3().setFromObject(root); if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1.15 / camera.aspect ** .6 : 1.05);
    controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(.45, .75, .8).normalize().multiplyScalar(dist));
    sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(-9, 16, 7)); controls.update(); invalidate();
  }
  // Interiørmodus: kameraet står i øyehøyde og styres med se() og gå().
  function setWalk(pos) {
    if (pos && !walk.on) walk.saved = { p: camera.position.clone(), t: controls.target.clone() };
    walk.on = !!pos; controls.enabled = !pos; fill.intensity = pos ? .9 : 0; camera.fov = pos ? 75 : 50; walk.move = [0, 0];
    if (pos) { camera.position.set(pos.x, pos.y, pos.z); walk.pitch = 0; if (pos.yaw !== undefined) walk.yaw = pos.yaw; }
    else if (walk.saved) { camera.position.copy(walk.saved.p); controls.target.copy(walk.saved.t); controls.update(); }
    resize();
  }
  function look(dx, dy) { walk.yaw -= dx * .005; walk.pitch = Math.max(-1.3, Math.min(1.3, walk.pitch - dy * .005)); invalidate(); }
  function go(x, z) { walk.move = [x, z]; }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function aim(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(e) {
    aim(e);
    for (const h of ray.intersectObject(root, true)) for (let o = h.object; o && o !== root; o = o.parent) if (o.userData.id) return { id: o.userData.id, point: h.point };
    return null;
  }
  function planePoint(e, y) { aim(e); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()); }
  theme(); resize();
  return { build, select, frame, setInset, setWalk, look, go, pick, planePoint, theme, invalidate, controls, camera, root };
}
