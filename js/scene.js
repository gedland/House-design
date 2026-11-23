// Tegner husets JSON som Three.js-objekter. Hvert rom, vegg, åpning og møbel er et eget objekt med userData.id.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { MATERIALS, bounds } from './house.js';

const PATTERNS = { // 256 px = 1 m, lyse mønstre som fargen ganges inn i
  tre(x) { for (let r = 0; r < 8; r++) { x.fillStyle = `hsl(0 0% ${88 + (r * 37 % 5) * 3}%)`; x.fillRect(0, r * 32, 256, 32); line(x, 0, r * 32, 256, r * 32); const j = r * 97 % 256; line(x, j, r * 32, j, r * 32 + 32); } },
  panel(x) { for (let c = 0; c < 8; c++) { x.fillStyle = `hsl(0 0% ${92 + (c * 53 % 4) * 2}%)`; x.fillRect(c * 32, 0, 32, 256); line(x, c * 32, 0, c * 32, 256); } },
  flis(x) { for (let i = 0; i < 4; i++) { line(x, i * 64, 0, i * 64, 256); line(x, 0, i * 64, 256, i * 64); } },
  murstein(x) { for (let r = 0; r < 16; r++) { line(x, 0, r * 16, 256, r * 16); for (let c = 0; c < 4; c++) { const px = c * 64 + (r % 2) * 32; line(x, px, r * 16, px, r * 16 + 16); } } },
  takstein(x) { for (let r = 0; r < 4; r++) { line(x, 0, r * 64, 256, r * 64); for (let c = 0; c < 8; c++) { const px = c * 32 + (r % 2) * 16; line(x, px, r * 64, px, r * 64 + 64); } } },
  betong(x) { for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${(i * 7919 % 10) / 120})`; x.fillRect(i * 7919 % 256, i * 104729 % 256, 2, 2); } },
  // Svak sparkeltekstur, så malte flater ikke ser helt glatte og dataaktige ut. Så svak at fargen fortsatt stemmer.
  maling(x) { const r = rand(7); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${.01 + r() * .03})`; x.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } },
  tekstil(x) { const r = rand(3); for (let i = 0; i < 256; i += 3) { x.fillStyle = `rgba(0,0,0,${.03 + r() * .04})`; x.fillRect(0, i, 256, 1); x.fillRect(i, 0, 1, 256); } },
};
// Fast tilfeldighet, så mønstrene blir like hver gang.
const rand = s => () => (s = s * 16807 % 2147483647) / 2147483647;
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
  if (material === 'glass') { // sterkere omgivelseskart, så himmelen speiles i rutene. Om kvelden gløder rutene av lyset inne.
    const g = new THREE.MeshStandardMaterial({ color, roughness: .05, transparent: true, opacity: .4, envMapIntensity: 1.5, emissive: GLOW, emissiveIntensity: glow });
    glassMats.push(g); return matCache[key] = g;
  }
  // Skyggen tegnes fra forsiden (mot sola), ikke baksiden: da lekker ikke sollyset inn under veggfoten og langs vinduskarmene.
  return matCache[key] = new THREE.MeshStandardMaterial({ color, roughness: m.rough, metalness: m.metal || 0, map: texture(material), shadowSide: THREE.FrontSide });
}
const GLOW = new THREE.Color('#ffc98a'), glassMats = []; let glow = 0;
function setGlow(v) { if (v === glow) return; glow = v; for (const g of glassMats) g.emissiveIntensity = v; }
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
  m.position.set(x, y + h / 2, z); m.castShadow = !material.transparent; m.receiveShadow = true; parent.add(m); return m; // glass slipper sola gjennom
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
    const og = tag(new THREE.Group(), o.id, 'opening', o.type === 'door' ? 'Dør' : 'Vindu'), ww = b - a, hh = top - sill, f = .06, fm = mat(o.material, o.color);
    og.position.set((a + b) / 2, sill, 0);
    if (o.type === 'door') { box(og, ww, hh, .05, 0, 0, 0, fm); box(og, .03, .12, .12, ww / 2 - .1, Math.min(1, hh / 2), 0, mat('metall', '#b9b9b4')); }
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
  g.position.set(f.x, 0, f.z); g.rotation.y = (f.rot || 0) * Math.PI / 180; // 90 = baksiden mot −x
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

// Kontaktskygger. Glass tas ikke med (det skal ikke få skygge selv), og skyggen regnes ut i omtrent én prikk per CSS-piksel.
class ContactShadows extends GTAOPass {
  scale = 1;
  overrideVisibility() { super.overrideVisibility(); this.scene.traverse(o => { if (o.material?.transparent || o.userData.noAO) o.visible = false; }); }
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }
}
// Tonemapping og fargerom, pluss hvitbalanse (fargen ganges med whiteBalance først), så den ikke koster et eget steg.
class Output extends OutputPass {
  constructor() {
    super();
    this.uniforms.whiteBalance = { value: new THREE.Vector3(1, 1, 1) };
    this.material.fragmentShader = this.material.fragmentShader.replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform vec3 whiteBalance;')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv ); gl_FragColor.rgb *= whiteBalance;');
  }
}
// Glød rundt lamper og sterke høylys, regnet ut i lavere oppløsning (scale) så den koster lite.
class Glow extends UnrealBloomPass {
  scale = 1;
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }
}

// Lys i fysiske enheter: 1 = 1000 lux for lys som treffer en flate, 1000 cd/m² for flater som lyser. Himmelkartet skaleres så
// det gir lux-verdien under, og sol, himmel og lamper får da de samme styrkeforholdene som i virkeligheten. exposure er
// «kamerainnstillingen» utenfor og inne: inne åpnes blenderen to–tre trinn, som et kamera gjør, så vinduene blir lyse.
// balance = hvor mye kameraet hvitbalanserer mot himmellyset (0–1), utenfor og inne. Dagslys inne er ellers blåstikk; kveldslyset
// får beholde den varme fargen fra lampene.
// Himmelkartene er fra Poly Haven (CC0), lagret i hdri/. Mobil får 1k, PC 2k. reserve = enkel himmel til kartet er lastet.
const MOODS = {
  day: { hdri: 'kloofendal_48d_partly_cloudy_puresky', lux: 60, sunAt: [-9, 7], ground: '#5f6b48', exposure: [.075, 1.1], balance: [0, .65], lamps: 0, glow: 0,
    reserve: { top: '#6f97c4', mid: '#b8cde0', horizon: '#e8ece8', ground: '#5f6a52', el: 48, sun: 2.2 } },
  evening: { hdri: 'qwantani_sunset_puresky', lux: .15, sunAt: [-16, 10], ground: '#5d6650', exposure: [8, 14], balance: [0, 0], lamps: 1, glow: .15,
    reserve: { top: '#1f3a6e', mid: '#6d90c2', horizon: '#efbb92', ground: '#3d4538', el: 6, sun: 1.4 } },
};
const LUMENS = 150, INDOOR = .04, GLASS = .85; // lumen per m² gulv fra taklampene, andel av himmellyset som når inn som gjenskinn, glassets gjennomslipp
const LUM = [.2126, .7152, .0722], BINS = [64, 32];
const COARSE = matchMedia('(pointer: coarse)').matches;
const SKY_RES = COARSE || Math.max(screen.width, screen.height) < 1100 ? '1k' : '2k';
const linear = hex => new THREE.Color(hex); // Color tar sRGB-hex og lagrer lineære verdier

// Leser et himmelkart (RGBA halvflyttall, rad 0 = senit): tar sola ut av kartet så den kan bli et retningslys med skygger,
// roterer kartet så sola står i retningen az (radianer, som atan2(z, x)), og regner ut lysstyrker fra resten.
// Det som tas ut av kartet, blir solas styrke. Slik telles ikke sollyset to ganger, og forholdet mellom sol og himmel blir
// det samme som i bildet.
function readSky(tex, mood) {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const { data, width: W, height: H } = tex.image, half = THREE.DataUtils.fromHalfFloat, toHalf = THREE.DataUtils.toHalfFloat;
  const elev = r => (.5 - (r + .5) / H) * Math.PI, cell = (Math.PI / H) * (2 * Math.PI / W);
  const lum = new Float32Array(W * H), sample = []; let max = 0;
  for (let i = 0, n = W * H; i < n; i++) {
    const v = LUM[0] * half(data[i * 4]) + LUM[1] * half(data[i * 4 + 1]) + LUM[2] * half(data[i * 4 + 2]);
    lum[i] = v; if (v > max) max = v; if (i < n / 2 && i % 7 === 0) sample.push(v);
  }
  sample.sort((a, b) => a - b);
  const limit = Math.min(50 * sample[sample.length >> 1], .25 * max), sun = [0, 0, 0], dir = new THREE.Vector3();
  for (let i = 0; i < W * H; i++) {
    if (lum[i] <= limit) continue;
    const r = Math.floor(i / W), c = i % W, el = elev(r), phi = ((c + .5) / W - .5) * 2 * Math.PI, w = Math.cos(el) * cell, k = limit / lum[i];
    for (let ch = 0; ch < 3; ch++) { const v = half(data[i * 4 + ch]); sun[ch] += v * (1 - k) * w; data[i * 4 + ch] = toHalf(v * k); }
    dir.x += Math.cos(el) * Math.cos(phi) * lum[i] * w; dir.y += Math.sin(el) * lum[i] * w; dir.z += Math.cos(el) * Math.sin(phi) * lum[i] * w;
  }
  dir.normalize();
  // Roter: flytt kolonnene så sola havner i retningen az. Kartet slås opp med u = atan2(z, x) / 2π + 0,5.
  const az = Math.atan2(mood.sunAt[1], mood.sunAt[0]), shift = ((Math.round((az - Math.atan2(dir.z, dir.x)) / (2 * Math.PI) * W) % W) + W) % W;
  if (shift) {
    const row = new Uint16Array(W * 4);
    for (let r = 0; r < H; r++) { const o = r * W * 4; row.set(data.subarray(o, o + W * 4)); data.set(row.subarray(0, (W - shift) * 4), o + shift * 4); data.set(row.subarray((W - shift) * 4), o); }
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -shift / W * 2 * Math.PI);
  }
  // Lyskart: en mindre kopi (512 × 256) som blir omgivelseslyset. Under horisonten står bakken (fargen ganger lyset den får).
  // Bakgrunnen får i stedet horisontfargen under horisonten, så den glir sømløst over i disen over bakken.
  const EW = Math.min(512, W), EH = EW / 2, env = new Float32Array(EW * EH * 4), n = new Float32Array(EW * EH), step = Math.max(1, W / EW >> 1);
  for (let r = 0; r < H; r += step) for (let c = 0; c < W; c += step) {
    const e = Math.floor(r / H * EH) * EW + Math.floor(c / W * EW), i = (r * W + c) * 4;
    env[e * 4] += half(data[i]); env[e * 4 + 1] += half(data[i + 1]); env[e * 4 + 2] += half(data[i + 2]); n[e]++;
  }
  for (let e = 0; e < EW * EH; e++) for (let ch = 0; ch < 3; ch++) env[e * 4 + ch] /= n[e] || 1;
  const cellE = r => Math.cos((.5 - (r + .5) / EH) * Math.PI) * (Math.PI / EH) * (2 * Math.PI / EW);
  const sunLum = LUM[0] * sun[0] + LUM[1] * sun[1] + LUM[2] * sun[2];
  const skyRGB = [0, 0, 0];
  for (let r = 0; r < EH / 2; r++) for (let c = 0; c < EW; c++) for (let ch = 0; ch < 3; ch++) skyRGB[ch] += env[(r * EW + c) * 4 + ch] * Math.sin((.5 - (r + .5) / EH) * Math.PI) * cellE(r);
  const sky = LUM[0] * skyRGB[0] + LUM[1] * skyRGB[1] + LUM[2] * skyRGB[2];
  const total = sky + sunLum * Math.max(0, dir.y), scale = mood.lux / total; // lux på bakken fra himmel og sol, før skalering
  // Bakken i lyskartet er nøytral (gress, grus og vegger rundt i snitt), så den ikke farger tak og vegger grønne.
  const ground = [.2, .19, .17].map(a => a * total / Math.PI);
  const hz = [0, 0, 0], rows = Math.max(1, Math.round(EH / 90)); // snittet av de nederste 2° over horisonten
  for (let r = EH / 2 - rows; r < EH / 2; r++) for (let c = 0; c < EW; c++) for (let ch = 0; ch < 3; ch++) hz[ch] += env[(r * EW + c) * 4 + ch] / (rows * EW);
  for (let r = EH / 2; r < EH; r++) for (let c = 0; c < EW; c++) env.set([...ground, 1], (r * EW + c) * 4);
  const envTex = new THREE.DataTexture(Uint16Array.from(env, v => toHalf(v)), EW, EH, THREE.RGBAFormat, THREE.HalfFloatType);
  Object.assign(envTex, { flipY: true, mapping: THREE.EquirectangularReflectionMapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, needsUpdate: true });
  const hzHalf = hz.map(v => toHalf(v)), fade = Math.max(1, Math.round(H / 120)); // 1,5° overgang
  for (let r = H / 2; r < H; r++) {
    const k = Math.min(1, (r - H / 2 + 1) / fade);
    for (let c = 0; c < W; c++) { const i = (r * W + c) * 4; for (let ch = 0; ch < 3; ch++) data[i + ch] = k >= 1 ? hzHalf[ch] : toHalf(half(data[i + ch]) * (1 - k) + hz[ch] * k); }
  }
  tex.needsUpdate = true;
  // Grovt rutenett (64 × 32) til lyset som kommer inn gjennom vinduene.
  const [BW, BH] = BINS, bins = new Float32Array(BW * BH * 3), fx = EW / BW;
  for (let r = 0; r < EH; r++) for (let c = 0; c < EW; c++) for (let ch = 0; ch < 3; ch++) bins[(Math.floor(r / fx) * BW + Math.floor(c / fx)) * 3 + ch] += env[(r * EW + c) * 4 + ch] / (fx * fx);
  const binDir = b => { const el = (.5 - (Math.floor(b / BW) + .5) / BH) * Math.PI, phi = ((b % BW + .5) / BW - .5) * 2 * Math.PI; return [Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi), Math.cos(el) * (Math.PI / BH) * (2 * Math.PI / BW)]; };
  const horizon = new THREE.Color(...hz);
  const m = Math.max(...sun);
  return {
    tex, envTex, scale, dir, sunColor: new THREE.Color(sun[0] / m, sun[1] / m, sun[2] / m), sunI: m * scale, horizon: horizon.multiplyScalar(scale),
    ground: new THREE.Color(...ground).multiplyScalar(scale), up: new THREE.Color().setScalar(sky * scale), skyTint: new THREE.Color(...skyRGB.map(v => v / sky)),
    // Snittlyset (cd/m²-enheter) fra himmel og bakke sett fra et vindu som vender i retningen n = [x, z].
    window([nx, nz]) {
      const c = [0, 0, 0]; let wsum = 0;
      for (let b = 0; b < BW * BH; b++) {
        const [x, y, z, w] = binDir(b), k = Math.max(0, x * nx + z * nz) * w; if (!k) continue;
        for (let ch = 0; ch < 3; ch++) c[ch] += bins[b * 3 + ch] * k;
        wsum += k;
      }
      return new THREE.Color(...c.map(v => v / wsum * scale));
    },
  };
}
// Enkel himmel (fargeovergang og en sol) mens det ekte himmelkartet lastes, eller hvis det ikke kan lastes.
function reserveSky(mood) {
  const W = 128, H = 64, data = new Uint16Array(W * H * 4), f = mood.reserve, toHalf = THREE.DataUtils.toHalfFloat;
  const top = linear(f.top), mid = linear(f.mid), horizon = linear(f.horizon), ground = linear(f.ground), c = new THREE.Color();
  for (let r = 0; r < H; r++) {
    const h = Math.sin((.5 - (r + .5) / H) * Math.PI);
    if (h >= .18) c.copy(mid).lerp(top, Math.pow((h - .18) / .82, .8)); else if (h >= 0) c.copy(horizon).lerp(mid, h / .18); else c.copy(horizon).lerp(ground, Math.min(1, -h * 6));
    for (let x = 0; x < W; x++) data.set([toHalf(c.r), toHalf(c.g), toHalf(c.b), toHalf(1)], (r * W + x) * 4);
  }
  // Sola: 2×2 punkter, så sterk at den gir f.sun ganger lyset fra himmelen.
  const r0 = Math.round((.5 - f.el / 180) * H) - 1, w = Math.cos(f.el * Math.PI / 180) * (Math.PI / H) * (2 * Math.PI / W) * 4, sunL = f.sun * Math.PI * .5 / w;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) data.set([toHalf(sunL), toHalf(sunL * .95), toHalf(sunL * .85), toHalf(1)], ((r0 + dr) * W + W / 2 + dc) * 4);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  Object.assign(tex, { flipY: true, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
  return tex;
}
const fwd = yaw => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
const ease = k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
const MAX_LAMPS = COARSE ? 6 : 10, MAX_WINDOWS = COARSE ? 2 : 6; // vinduslysene er det dyreste inne (ca. 7 % hver på mobil)

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Myke skygger (VSM, uskarphet rundt kanten). Skyggekartet tegnes bare på nytt når huset eller sola endres, ikke når kameraet flytter seg.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap; renderer.shadowMap.autoUpdate = false;
  // Khronos PBR Neutral: gjengir fargene fra JSON-en mest likt på demohuset (AgX bleker dem, ACES gjør dem mørkere og forskyver dem).
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .05, 400);
  // Himmelkartet, kontaktskyggene og gløden trenger flyttall-bilder. Eldre mobiler uten dem får himmellys fra en halvkule.
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const pmrem = hdr ? new THREE.PMREMGenerator(renderer) : null;
  const root = new THREE.Group(); root.name = 'Hus'; scene.add(root);
  const lamps = new THREE.Group(); lamps.name = 'Taklamper'; scene.add(lamps); // utenfor root: tas ikke med i valg eller GLB-eksport
  scene.fog = new THREE.Fog('#ffffff', 40, 200);
  const hemi = new THREE.HemisphereLight('#ffffff', '#8a8578', hdr ? 0 : 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2);
  sun.castShadow = true; sun.shadow.mapSize.setScalar(COARSE ? 1024 : 2048); sun.shadow.bias = -.0003; sun.shadow.normalBias = .02; // mobil: halv oppløsning (VSM-kartet tar 64 MB i 2048)
  sun.shadow.radius = COARSE ? 2 : 3; sun.shadow.blurSamples = COARSE ? 8 : 12;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.MeshStandardMaterial({ roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; ground.receiveShadow = true; ground.userData.noAO = true; scene.add(ground);
  // Vinduslys: himmellyset som faller inn gjennom vinduene når du er inne. Gir lyse rom ved vinduet og mørkere innerst.
  RectAreaLightUniformsLib.init();
  const windows = new THREE.Group(); windows.name = 'Vinduslys';
  for (let i = 0; i < MAX_WINDOWS; i++) windows.add(new THREE.RectAreaLight('#ffffff', 0, 1, 1));
  // Etterbehandling: scenen (med kantutjevning) → kontaktskygger → glød → tonemapping og fargerom.
  // Uten flyttall-bilder tegnes scenen rett ut, fortsatt med tonemapping, men uten kontaktskygger og glød.
  let composer = null, ao = null, bloom = null, output = null;
  if (hdr) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    ao = new ContactShadows(scene, camera, 1, 1, undefined, { radius: .4, distanceExponent: 1.5, thickness: .3, distanceFallOff: .5, scale: 1.6, samples: COARSE ? 12 : 16 }, { radius: 4, radiusExponent: 1, samples: COARSE ? 8 : 16 });
    bloom = new Glow(new THREE.Vector2(1, 1), .15, .4, 1);
    composer.addPass(new RenderPass(scene, camera)); composer.addPass(ao); composer.addPass(bloom); composer.addPass(output = new Output());
  }
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = 1; controls.maxDistance = 90;
  let maxPr = 2, slow = 0, drawn = 0, drewLast = false;
  let dirty = true, byId = {}, lit = [], inset = [0, 0], last = 0, mode = 'orbit', flight = null, mood = MOODS.day;
  let shown = { house: null, floor: null }, focusY = null, occluders = [];
  const walk = { yaw: 0, pitch: 0, move: [0, 0], saved: null };
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const pr = Math.min(devicePixelRatio, maxPr); renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    if (composer) { ao.scale = 1 / pr; bloom.scale = (COARSE ? .5 : 1) / pr; composer.setPixelRatio(pr); composer.setSize(w, h); }
    camera.aspect = w / h; if (mode === 'walk' && !flight) camera.fov = walkFov();
    camera.setViewOffset(w, h, inset[0] / 2, inset[1] / 2, w, h); invalidate();
  }
  // Bildefrekvens: tegnes det sammenhengende (kameraet flyr, du drar eller går) og bildene kommer sjeldnere enn hvert 40. ms
  // (under 25 bilder/s), senkes oppløsningen et trinn, ned til én prikk per CSS-piksel. Ikke i automatiske kjøringer
  // (tools/bilder.js), så skjermbildene der alltid har samme oppløsning.
  function frameRate(t, continuous) {
    const gap = t - drawn; drawn = t;
    if (!continuous || maxPr <= 1 || navigator.webdriver) return;
    slow = gap > 40 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 20) { maxPr = Math.max(1, maxPr - .25); slow = 0; resize(); }
  }
  // Inne: vidvinkel. På en stående mobilskjerm enda videre, ellers ser du bare et utsnitt av rommet.
  const walkFov = () => camera.aspect >= 1 ? 75 : Math.min(95, 2 * Math.atan(Math.tan(37.5 * Math.PI / 180) / camera.aspect ** .6) * 180 / Math.PI);
  // Flytter bildet så huset står midt i den delen av skjermen som panelet ikke dekker.
  function setInset(right, bottom) { if (right === inset[0] && bottom === inset[1]) return; inset = [right, bottom]; resize(); }
  new ResizeObserver(resize).observe(canvas);

  // Kameraflyvning: kameraet glir langs en myk kurve i stedet for å hoppe. looks = punktene kameraet ser mot underveis.
  function lookPoint() {
    if (flight) return flight.L.clone();
    return mode === 'walk' ? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3)) : controls.target.clone();
  }
  function fly(points, looks, { fov = camera.fov, done } = {}) {
    const P = [camera.position.clone(), ...points], L = [lookPoint(), ...looks];
    let dist = 0; for (let i = 1; i < P.length; i++) dist += P[i].distanceTo(P[i - 1]);
    flight = { P: new THREE.CatmullRomCurve3(P, false, 'centripetal'), Lc: new THREE.CatmullRomCurve3(L, false, 'centripetal'), L: L[0].clone(),
      fov0: camera.fov, fov1: fov, t0: performance.now(), ms: reduce.matches ? 0 : Math.min(2400, 650 + dist * 45), done };
    controls.enabled = false; invalidate();
  }
  // Der kameraet ender når flyvningen er ferdig.
  const goal = () => flight ? { p: flight.P.getPoint(1), t: flight.Lc.getPoint(1) } : { p: camera.position.clone(), t: controls.target.clone() };

  requestAnimationFrame(function loop() {
    requestAnimationFrame(loop);
    const t = performance.now(), dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    if (flight) {
      const f = flight, k = f.ms ? Math.min(1, (t - f.t0) / f.ms) : 1, e = ease(k);
      camera.position.copy(f.P.getPoint(e)); f.L.copy(f.Lc.getPoint(e)); camera.lookAt(f.L);
      if (f.fov0 !== f.fov1) { camera.fov = f.fov0 + (f.fov1 - f.fov0) * e; camera.updateProjectionMatrix(); }
      dirty = true;
      if (k >= 1) {
        flight = null;
        if (mode === 'orbit') { controls.target.copy(f.L); controls.enabled = true; controls.update(); }
        else { const d = camera.getWorldDirection(new THREE.Vector3()); walk.yaw = Math.atan2(-d.x, -d.z); walk.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); }
        f.done?.();
      }
    } else if (mode === 'walk') {
      const [mx, mz] = walk.move;
      if (mx || mz) {
        const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw), v = 2.4 * dt;
        camera.position.x += (mx * c - mz * s) * v; camera.position.z += (-mx * s - mz * c) * v; dirty = true;
      }
      camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
    }
    const rendered = dirty;
    if (dirty) {
      if (mode === 'walk') updateWindows();
      dirty = false; frameRate(t, drewLast);
      composer ? composer.render(dt) : renderer.render(scene, camera);
      api.onFrame?.();
    }
    drewLast = rendered;
  });

  // Taklamper: en nedlyslampe midt i taket i hvert rom, om kvelden overalt, inne i huset også på dagtid. Lysmengden følger
  // gulvarealet (LUMENS per m², som vanlig boligbelysning), så lampene er nesten usynlige ved siden av dagslys og tydelige om kvelden.
  // Antallet er begrenset (hvert lys koster på mobil), og rommene nærmest etasjen du står i får lys først.
  const CONE = 1.15, discGeo = new THREE.CylinderGeometry(.17, .17, .012, 24);
  const discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0d8').multiplyScalar(12) }); // ca. 12 000 cd/m², som en opal lampeskjerm
  function updateLamps() {
    lamps.clear();
    const { house, floor } = shown;
    if (!house || !(mood.lamps || mode === 'walk')) return;
    const all = []; let y = 0;
    house.floors.forEach((f, i) => {
      if (floor === null || i <= floor) for (const r of f.rooms) all.push({ r, y, H: f.height, ceiling: floor !== i, top: i === house.floors.length - 1 });
      y += f.height;
    });
    const near = a => focusY === null ? 0 : Math.abs(a.y + 1.6 - focusY);
    all.sort((a, b) => near(a) - near(b) || b.r.w * b.r.d - a.r.w * a.r.d);
    for (const { r, y, H, ceiling, top } of all.slice(0, MAX_LAMPS)) {
      const lm = LUMENS * Math.min(40, Math.max(4, r.w * r.d)), cx = r.x + r.w / 2, cz = r.z + r.d / 2, ceil = y + H - (top ? .1 : .15);
      const l = new THREE.SpotLight('#ffd3a3', lm / 1000 / (2 * Math.PI * (1 - Math.cos(CONE))), Math.max(r.w, r.d) * 1.5 + 2, CONE, .8, 2);
      l.position.set(cx, ceil - .03, cz); l.target.position.set(cx, ceil - 3, cz); lamps.add(l, l.target);
      if (ceiling) { const d = new THREE.Mesh(discGeo, discMat); d.position.set(cx, ceil - .006, cz); lamps.add(d); }
    }
  }
  // Vinduslysene står i de nærmeste vinduene i etasjen du er i, og lyser med himmelen og bakken utenfor det vinduet.
  let wins = [];
  const winAt = new THREE.Vector3(Infinity, 0, 0);
  function updateWindows(force) {
    if (mode !== 'walk' || !hdr || !sky) { if (windows.parent) { scene.remove(windows); invalidate(); } return; }
    if (!windows.parent) { scene.add(windows); force = true; }
    const p = camera.position; if (!force && p.distanceTo(winAt) < .75) return;
    winAt.copy(p);
    const near = wins.filter(w => Math.abs(w.y - p.y) < 2.5).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    windows.children.forEach((l, i) => {
      const w = near[i]; if (!w) { l.intensity = 0; return; }
      if (w.skyFor !== sky) { w.sky = sky.window([-w.n[0], -w.n[1]]).multiplyScalar(GLASS); w.skyFor = sky; }
      const m = Math.max(w.sky.r, w.sky.g, w.sky.b, 1e-6);
      l.color.setRGB(w.sky.r / m, w.sky.g / m, w.sky.b / m); l.intensity = m; l.width = w.w; l.height = w.h;
      l.position.set(w.x, w.y, w.z); l.lookAt(w.x + w.n[0], w.y, w.z + w.n[1]);
    });
    invalidate();
  }
  // Skyggekameraet følger huset og skyggen det kaster bortover bakken, så skyggekartet brukes der det trengs og blir skarpt.
  function fitShadow() {
    const d = sky ? sky.dir : new THREE.Vector3(0, 1, 0), b = new THREE.Box3().setFromObject(root);
    if (b.isEmpty()) b.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2, gy = ground.position.y;
    sun.target.position.copy(c); sun.position.copy(c).addScaledVector(d, r + 20); sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
    const cam = sun.shadow.camera, lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      const q = p.clone().addScaledVector(d, -Math.min(70, (p.y - gy) / Math.max(.02, d.y))); // der skyggen av hjørnet treffer bakken
      for (const v of [p, q]) { v.applyMatrix4(cam.matrixWorldInverse); lo.min(v); hi.max(v); }
    }
    Object.assign(cam, { left: lo.x - .5, right: hi.x + .5, bottom: lo.y - .5, top: hi.y + .5, near: Math.max(.1, -hi.z - 1), far: -lo.z + 1 });
    cam.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true; invalidate();
  }
  // Himmelkartet: lys, refleksjoner og bakgrunn. Det ekte kartet lastes første gang en stemning brukes, og caches.
  const skies = {}, loading = {}, loader = new RGBELoader().setDataType(THREE.HalfFloatType);
  let sky = null;
  function applySky(info) {
    sky = info;
    if (pmrem) { info.env ??= pmrem.fromEquirectangular(info.envTex).texture; scene.environment = info.env; scene.background = info.tex; scene.backgroundIntensity = info.scale; }
    else scene.background = info.horizon.clone();
    scene.fog.color.copy(info.horizon);
    sun.color.copy(info.sunColor); sun.intensity = info.sunI;
    hemi.color.copy(info.up); hemi.groundColor.copy(info.ground).multiplyScalar(Math.PI);
    canvas.dataset.sky = info.real ? 'hdri' : 'reserve';
    fitShadow(); lights();
  }
  function setMood(name) {
    const m = mood = MOODS[name] || MOODS.day;
    ground.material.color.set(m.ground);
    if (skies[m.hdri]) return applySky(skies[m.hdri]);
    applySky(skies['reserve:' + m.hdri] ??= readSky(reserveSky(m), m));
    loading[m.hdri] ??= loader.loadAsync(`hdri/${m.hdri}_${SKY_RES}.hdr`).then(tex => {
      skies[m.hdri] = Object.assign(readSky(tex, m), { real: true });
      if (mood === m) applySky(skies[m.hdri]);
    }, e => { delete loading[m.hdri]; canvas.dataset.skyError = e.message || 'feil'; console.warn('Himmelkartet kunne ikke lastes, bruker enkel himmel.', e); });
  }
  // Lys som avhenger av både stemning og om du er inne: kamerainnstilling, lamper, vinduslys, gjenskinn inne og glødende ruter.
  function lights() {
    const inside = mode === 'walk', e = mood.exposure[inside ? 1 : 0];
    renderer.toneMappingExposure = e;
    if (output && sky) { // hvitbalanse: del på himmelfargen, i den grad balance sier, uten å endre lysstyrken
      const k = mood.balance[inside ? 1 : 0], t = sky.skyTint, g = [t.r, t.g, t.b].map(v => Math.pow(1 / v, k)), l = LUM[0] * g[0] * t.r + LUM[1] * g[1] * t.g + LUM[2] * g[2] * t.b;
      output.uniforms.whiteBalance.value.set(...g.map(v => v / l));
    }
    if (bloom) { bloom.threshold = 3 / e; bloom.highPassUniforms.smoothWidth.value = 2 / e; } // bare det som er mye lysere enn hvitt, gløder
    if (sky) { scene.environmentIntensity = sky.scale * (inside ? INDOOR : 1); hemi.intensity = hdr ? 0 : inside ? INDOOR : 1; }
    updateLamps(); updateWindows(true); setGlow(mood.lamps && !inside ? mood.glow : 0); invalidate();
  }

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
    // Det som kan skjule et romnavn: vegger, gulv og tak. Ikke dører, vinduer, glass og møbler.
    occluders = [];
    root.traverse(o => {
      if (!o.isMesh || o.material.transparent) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.kind === 'opening' || p.userData.kind === 'furniture') return;
      occluders.push(o);
    });
    // Kontaktskyggene regnes bare ut rundt huset, ikke ut over hele bakken.
    if (ao) { const b = new THREE.Box3().setFromObject(root); ao.setSceneClipBox(b.isEmpty() ? null : b.expandByScalar(1)); }
    // Vinduene i yttervegger (rom på bare én side), til vinduslysene. n = retningen inn i rommet.
    wins = []; y = 0;
    house.floors.forEach((f, i) => {
      const inRoom = (x, z) => f.rooms.some(r => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
      if (floor === null || i <= floor) for (const w of f.walls) {
        const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1, ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L;
        for (const o of w.openings || []) {
          if (o.type !== 'window') continue;
          const px = w.x1 + ux * o.pos, pz = w.z1 + uz * o.pos, a = inRoom(px - uz * .4, pz + ux * .4), b = inRoom(px + uz * .4, pz - ux * .4);
          if (a === b) continue;
          const n = a ? [-uz, ux] : [uz, -ux], sill = Math.min(o.sill, f.height - .3), top = Math.min(f.height, sill + o.height), k = .03; // rett innenfor glasset
          wins.push({ x: px + n[0] * k, y: y + (sill + top) / 2, z: pz + n[1] * k, w: Math.max(.1, o.width - .12), h: Math.max(.1, top - sill - .12), n });
        }
      }
      y += f.height;
    });
    shown = { house, floor }; fitShadow(); updateLamps(); updateWindows(true); invalidate();
  }
  function select(id) {
    const o = byId[id]; if (!o) return;
    o.traverse(m => {
      if (!m.isMesh || (id !== m.parent.userData.id && m.parent.userData.kind === 'opening')) return;
      m.material = m.material.clone(); m.material.emissive.set('#2f8f6b'); m.material.emissiveIntensity = .45; lit.push(m.material);
    });
    invalidate();
  }
  // steep = se bratt ned, slik at veggene ikke skjuler gulv og møbler når taket er tatt av.
  // intro = kameraet kommer svevende inn fra avstand, som en dronefilm, når et nytt hus vises.
  function frame(steep, { intro = false } = {}) {
    if (mode === 'walk') return;
    const b = new THREE.Box3().setFromObject(root); if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1.15 / camera.aspect ** .6 : 1.05) * (steep ? 1.12 : 1);
    const dir = new THREE.Vector3(...(steep ? [.12, 1, .25] : [.45, .75, .8])).normalize();
    if (intro && !reduce.matches) {
      const at = (a, k, up) => c.clone().add(dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(dist * k)).add(new THREE.Vector3(0, up * dist, 0));
      flight = null; camera.position.copy(at(-.9, 2.1, .25)); controls.target.copy(c); camera.lookAt(c);
      fly([at(-.4, 1.4, .08), at(0, 1, 0)], [c, c]); flight.ms = 2200;
    } else fly([c.clone().add(dir.multiplyScalar(dist))], [c]);
  }
  // Interiørmodus: kameraet står i øyehøyde og styres med look() og go().
  // via = { out, at }: kameraet flyr først ut foran et vindu (out, sett mot at) og så inn gjennom glasset.
  function setWalk(pos, via) {
    const v = a => new THREE.Vector3(...a);
    if (pos) {
      if (mode === 'orbit') walk.saved = goal();
      mode = 'walk'; walk.move = [0, 0]; focusY = pos.y;
      const P = new THREE.Vector3(pos.x, pos.y, pos.z), L = P.clone().add(fwd(pos.yaw ?? walk.yaw).multiplyScalar(3)).add(new THREE.Vector3(0, 3 * Math.tan(pos.pitch || 0), 0));
      fly(via ? [v(via.out), P] : [P], via ? [v(via.at), L] : [L], { fov: walkFov() });
    } else if (mode === 'walk') {
      mode = 'orbit'; walk.move = [0, 0]; focusY = null;
      const s = walk.saved;
      if (s) fly([s.p], [s.t], { fov: 50 }); else { camera.fov = 50; frame(); }
    }
    lights(); resize();
  }
  // Går (flyr) til et punkt i samme høyde, med blikket i gåretningen.
  function walkTo(x, z) {
    if (mode !== 'walk') return;
    const P = new THREE.Vector3(x, camera.position.y, z), d = P.clone().sub(camera.position).setY(0);
    if (d.lengthSq() < .04) return;
    d.normalize(); fly([P], [P.clone().addScaledVector(d, 3)]);
  }
  function look(dx, dy) { if (flight) return; walk.yaw -= dx * .005; walk.pitch = Math.max(-1.3, Math.min(1.3, walk.pitch - dy * .005)); invalidate(); }
  function go(x, z) { walk.move = [x, z]; }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function aim(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(e) {
    aim(e);
    for (const h of ray.intersectObject(root, true)) for (let o = h.object; o && o !== root; o = o.parent) if (o.userData.id) return { id: o.userData.id, point: h.point };
    return null;
  }
  function planePoint(e, y) { aim(e); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()); }
  // Ligger det en vegg, et gulv eller tak mellom kameraet og punktet?
  const look3 = new THREE.Vector3();
  function hidden(x, y, z) {
    look3.set(x, y, z).sub(camera.position); const L = look3.length(); if (L < .3) return false;
    ray.set(camera.position, look3.divideScalar(L)); ray.far = L - .2;
    const hit = ray.intersectObjects(occluders, false).length > 0; ray.far = Infinity; return hit;
  }
  // Skjermpunkt (CSS-piksler) for et punkt i huset, eller null når det ligger bak kameraet eller utenfor bildet.
  function screen(x, y, z) {
    look3.set(x, y, z).project(camera); if (Math.abs(look3.z) > 1 || Math.abs(look3.x) > .95 || Math.abs(look3.y) > .95) return null;
    return [(look3.x + 1) / 2 * canvas.clientWidth, (1 - look3.y) / 2 * canvas.clientHeight];
  }
  resize();
  const api = { build, select, frame, setInset, setWalk, walkTo, look, go, pick, planePoint, hidden, screen, setMood, theme: invalidate, invalidate, controls, camera, root, onFrame: null,
    get flying() { return !!flight; } };
  setMood('day');
  return api;
}
