// Tegner husets JSON som Three.js-objekter. Hvert rom, vegg, åpning og møbel er et eget objekt med userData.id.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS, outline, inPoly } from './house.js';

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

// Prisme med firkantet grunnflate (hjørner [x, z] i rekkefølge rundt), fra y0 til y1. UV i meter.
function prism(pts, y0, y1) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cz = pts.reduce((s, p) => s + p[1], 0) / 4, cy = (y0 + y1) / 2;
  const pos = [], uv = [];
  const quad = (a, b, c, d, uvs) => { // fire hjørner [x,y,z]; snus så forsiden peker ut fra midten
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    const out = new THREE.Vector3((a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz);
    const v = n.dot(out) >= 0 ? [a, b, c, d] : [a, d, c, b], t = n.dot(out) >= 0 ? uvs : [uvs[0], uvs[3], uvs[2], uvs[1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...v[i]); uv.push(...t[i]); }
  };
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % 4], L = Math.hypot(x2 - x1, z2 - z1);
    if (L > 1e-6) quad([x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1], [[0, y0], [L, y0], [L, y1], [0, y1]]);
  }
  for (const y of [y0, y1]) quad(...pts.map(([x, z]) => [x, y, z]), pts.map(([x, z]) => [x, z]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
function mesh(parent, geo, material) { const m = new THREE.Mesh(geo, material); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
// Gulvet er en plate fra 15 cm under gulvnivå til 1 cm over, så veggene står i platen og ingen flater ligger oppå hverandre.
// lift skiller rom som overlapper, så de ikke flimrer.
function buildRoom(r, lift = 0) {
  const g = tag(new THREE.Group(), r.id, 'room', r.name);
  box(g, r.w, .16, r.d, r.x + r.w / 2, -.15 + lift, r.z + r.d / 2, mat(r.material, r.color));
  return g;
}
// Hvor langt hver side av veggen skal gå forbi endepunktet, så vegger møtes uten hull og uten å overlappe:
// hjørner gjæres, en vegg som ender midt på en annen stopper mot flaten dens, og frie ender er rette.
// Returnerer [[start+, start-], [slutt+, slutt-]] i meter (negativt = kortere). + er siden i retning n = (-dz, dx).
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], cross = (a, b) => a[0] * b[1] - a[1] * b[0], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function wallFrame(w) { const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1, d = [(w.x2 - w.x1) / L, (w.z2 - w.z1) / L]; return { L, d, n: [-d[1], d[0]] }; }
function joints(walls) {
  const out = new Map(), E = .02;
  for (const w of walls) {
    const fw = wallFrame(w), ends = [];
    for (const k of [1, 2]) {
      const P = [w['x' + k], w['z' + k]], u = k === 2 ? fw.d : [-fw.d[0], -fw.d[1]], body = [-u[0], -u[1]];
      const hit = (line, o, dir) => { // forlengelse langs u til linjen o + μ·dir, for hver side av veggen
        const r = [];
        for (const sg of [1, -1]) { const A = [P[0] + sg * fw.n[0] * w.thickness / 2, P[1] + sg * fw.n[1] * w.thickness / 2], c = cross(u, dir); r.push(Math.abs(c) < 1e-6 ? 0 : Math.max(-2 * w.thickness - .3, Math.min(2 * w.thickness + .3, cross(sub(o, A), dir) / c))); }
        return r;
      };
      let res = [0, 0], tee = null; const at = [];
      for (const v of walls) {
        if (v === w) continue;
        const fv = wallFrame(v);
        for (const j of [1, 2]) if (Math.hypot(v['x' + j] - P[0], v['z' + j] - P[1]) < E) at.push({ v, fv, dir: j === 1 ? fv.d : [-fv.d[0], -fv.d[1]] });
        const s = dot(sub(P, [v.x1, v.z1]), fv.d), off = cross(fv.d, sub(P, [v.x1, v.z1]));
        if (Math.abs(off) < E && s > E && s < fv.L - E) tee = { v, fv };
      }
      const collinear = at.find(a => dot(a.dir, u) > .999);
      const opposite = at.length >= 2 && at.find(a => at.some(b => b !== a && dot(a.dir, b.dir) < -.999) && Math.abs(dot(a.dir, u)) < .999);
      if (!tee && opposite) tee = opposite;
      if (tee && !collinear) { // stopp mot flaten til veggen vi ender på
        const sg = Math.sign(dot(tee.fv.n, body)) || 1, o = [tee.v.x1 + sg * tee.fv.n[0] * tee.v.thickness / 2, tee.v.z1 + sg * tee.fv.n[1] * tee.v.thickness / 2];
        res = hit(null, o, tee.fv.d);
      } else if (!collinear && at.length) {
        const others = at.filter(a => a.v.exterior === w.exterior), a = (others.length === 1 ? others : at.length === 1 ? at : [])[0];
        if (a) { // gjæring: ytterside mot ytterside, innerside mot innerside
          const r = [];
          for (const sg of [1, -1]) {
            const outerW = dot([sg * fw.n[0], sg * fw.n[1]], a.dir) < 0;
            const sv = [1, -1].find(t => (dot([t * a.fv.n[0], t * a.fv.n[1]], body) < 0) === outerW);
            const A = [P[0] + sg * fw.n[0] * w.thickness / 2, P[1] + sg * fw.n[1] * w.thickness / 2], B = [P[0] + sv * a.fv.n[0] * a.v.thickness / 2, P[1] + sv * a.fv.n[1] * a.v.thickness / 2];
            const c = cross(u, a.dir);
            r.push(Math.abs(c) < 1e-6 ? 0 : Math.max(-2 * w.thickness - .3, Math.min(2 * w.thickness + .3, cross(sub(B, A), a.dir) / c)));
          }
          res = r;
        } else if (at.some(b => b.v.exterior) && !w.exterior) res = Array(2).fill(-Math.max(...at.map(b => b.v.thickness)) / 2);
      }
      ends.push(res);
    }
    out.set(w, ends);
  }
  return out;
}
// Vegg med dører og vinduer. ends = forlengelsene fra joints(), y0 = underkant (under gulvplaten i nederste etasje).
function buildWall(w, H, ends = [[0, 0], [0, 0]], y0 = 0) {
  const g = tag(new THREE.Group(), w.id, 'wall', 'Vegg'), dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz), t = w.thickness, m = mat(w.material, w.color);
  g.position.set(w.x1, 0, w.z1); g.rotation.y = -Math.atan2(dz, dx);
  const s0 = [-ends[0][0], -ends[0][1]], s1 = [L + ends[1][0], L + ends[1][1]]; // [+side, -side] langs veggen
  const solid = (a, b, ya, yb) => { // stykke av veggen fra a til b langs veggen; endene gjæres der stykket når veggens ender
    if (yb - ya < 1e-4) return;
    const ap = a <= 0 ? s0 : [a, a], bp = b >= L ? s1 : [b, b];
    if (bp[0] - ap[0] < 1e-4 && bp[1] - ap[1] < 1e-4) return;
    mesh(g, prism([[ap[0], t / 2], [bp[0], t / 2], [bp[1], -t / 2], [ap[1], -t / 2]], ya, yb), m);
  };
  let at = 0;
  for (const o of [...(w.openings || [])].sort((a, b) => a.pos - b.pos)) {
    const a = Math.max(at, o.pos - o.width / 2, .02), b = Math.min(L - .02, o.pos + o.width / 2), top = Math.min(H - .02, o.sill + o.height);
    if (b - a < .05 || top - o.sill < .05) continue;
    solid(at, a, y0, H); solid(a, b, y0, o.sill); solid(a, b, top, H); at = b;
    const og = tag(new THREE.Group(), o.id, 'opening', o.type === 'door' ? 'Dør' : 'Vindu'), ww = b - a, hh = top - o.sill, f = .06, fm = mat(o.material || 'maling', o.color);
    og.position.set((a + b) / 2, o.sill, 0);
    if (o.type === 'door') { box(og, ww - .01, hh - .005, .05, 0, 0, 0, mat(o.material || 'tre', o.color)); box(og, .03, .12, .12, ww / 2 - .1, Math.min(1, hh / 2), 0, mat('metall', '#b9b9b4')); }
    else {
      box(og, ww - .01, hh - .01, .02, 0, .005, 0, mat('glass', '#bcd7e6'));
      box(og, ww - .004, f, t + .02, 0, .002, 0, fm); box(og, ww - .004, f, t + .02, 0, hh - f - .002, 0, fm);
      box(og, f, hh - 2 * f - .01, t + .016, -ww / 2 + f / 2 + .002, f + .005, 0, fm); box(og, f, hh - 2 * f - .01, t + .016, ww / 2 - f / 2 - .002, f + .005, 0, fm);
      if (ww > 1) box(og, f * .7, hh - 2 * f - .01, .05, 0, f + .005, 0, fm);
    }
    g.add(og);
  }
  solid(at, L, y0, H);
  return g;
}
const PARTS = { // deler: [w, h, d, x, y, z, fargefaktor eller fast farge]
  sofa: (w, d, h) => [[w, h * .5, d, 0, 0, 0], [w, h * .5, d * .25, 0, h * .5, -d * .375, .9], [w * .1, h * .25, d * .75, -w * .45, h * .5, d * .125, .9], [w * .1, h * .25, d * .75, w * .45, h * .5, d * .125, .9]],
  bord: (w, d, h) => [[w, .05, d, 0, h - .05, 0], ...legs(w, d, h - .05, .06)],
  stol: (w, d, h) => [[w, .05, d, 0, h * .5, 0], [w, h * .45, .05, 0, h * .55, -d / 2 + .025], ...legs(w, d, h * .5, .04)],
  seng: (w, d, h) => [[w, h * .3, d, 0, 0, 0, .7], [w * .96, h * .25, d * .97, 0, h * .3, d * .01], [w, h, .08, 0, 0, -d / 2 + .04, .7], [w * .8, .1, .45, 0, h * .55, -d / 2 + .4, '#f4f1ea']],
  skap: (w, d, h) => [[w, h, d, 0, 0, 0], [.02, h * .9, .02, 0, h * .05, d / 2 + .01, .6]],
  kjokken: (w, d, h) => [[w, h - .04, d - .03, 0, 0, -.015], [w, .04, d, 0, h - .04, 0, '#3f3d3a'], [Math.min(.6, w * .3), .02, d * .6, -w * .25, h, 0, '#b9bcbd']],
  tv: (w, d, h) => [[w, h * .35, d, 0, 0, 0], [w * .85, h * .5, .04, 0, h * .45, 0, '#161616'], [.2, h * .1, .1, 0, h * .35, 0, '#161616']],
  toalett: (w, d, h) => [[w, h * .5, d * .65, 0, 0, d * .175], [w, h, d * .3, 0, 0, -d * .35, .95]],
  vask: (w, d, h) => [[w, h - .12, d, 0, 0, 0], [w, .12, d, 0, h - .12, 0, '#f6f5f2'], [.04, .15, .04, 0, h, -d * .3, '#b9bcbd']],
  dusj: (w, d, h) => [[w, .06, d, 0, 0, 0], [.03, h, d, -w / 2 + .015, 0, 0, 'glass'], [w, h, .03, 0, 0, d / 2 - .015, 'glass'], [.04, h * .95, .04, w / 2 - .1, 0, -d / 2 + .1, '#b9bcbd']],
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
// ------------------------------------------------------------------------------------------------
// Tak. Taket bygges over ytterkonturen til hver etasje, ikke over et rektangel rundt den:
// konturen deles i rektangler. Over øverste etasje får det største rektangelet husets taktype med mønet langs
// den lengste siden, og fløyene får tak med mønet på tvers av skjøten som går inn under hovedtaket.
// Den delen av en etasje som ikke har en etasje over seg, får flatt tak. Takflaten går gjennom ytterkanten av
// veggtoppen, så det ikke blir glipe mellom vegg og tak.
function cells(floor, above) {
  const rs = outline(floor); if (!rs) return null;
  const up = above && outline(above);
  const all = [...rs, ...(up || [])].flat();
  const xs = [...new Set(all.map(p => +p[0].toFixed(3)))].sort((a, b) => a - b), zs = [...new Set(all.map(p => +p[1].toFixed(3)))].sort((a, b) => a - b);
  const inside = (ps, x, z) => ps && ps.some(r => inPoly(x, z, r));
  const grid = xs.slice(1).map((x, i) => zs.slice(1).map((z, j) => {
    const cx = (xs[i] + x) / 2, cz = (zs[j] + z) / 2;
    return inside(rs, cx, cz) ? (inside(up, cx, cz) ? 2 : 1) : 0; // 0 = ute, 1 = denne etasjen uten etasje over, 2 = med etasje over
  }));
  return { xs, zs, grid, rect: rsRect(rs) };
}
const rsRect = rs => rs.length === 1 && rs[0].length === 4 && rs[0].every(([x, z], i, r) => { const [x2, z2] = r[(i + 1) % 4]; return Math.abs(x - x2) < 1e-6 || Math.abs(z - z2) < 1e-6; });
const axisAligned = rs => rs.every(r => r.every(([x, z], i) => { const [x2, z2] = r[(i + 1) % r.length]; return Math.abs(x - x2) < .01 || Math.abs(z - z2) < .01; }));
// Deler cellene med verdien want i rektangler, største først. Returnerer [{ i0, i1, j0, j1 }] (celleindekser, i1/j1 eksklusiv).
function rects(grid, want, xs, zs) {
  const used = grid.map(c => c.map(() => false)), out = [], free = (i, j) => grid[i]?.[j] === want && !used[i][j];
  for (;;) {
    let best = null;
    for (let i0 = 0; i0 < grid.length; i0++) for (let j0 = 0; j0 < grid[0].length; j0++) {
      if (!free(i0, j0)) continue;
      let jmax = grid[0].length;
      for (let i1 = i0; i1 < grid.length && free(i1, j0); i1++) {
        let j = j0; while (j < jmax && free(i1, j)) j++; jmax = j;
        const a = (xs[i1 + 1] - xs[i0]) * (zs[jmax] - zs[j0]); // areal i m², ikke antall celler
        if (!best || a > best.a) best = { i0, i1: i1 + 1, j0, j1: jmax, a };
      }
    }
    if (!best) return out;
    for (let i = best.i0; i < best.i1; i++) for (let j = best.j0; j < best.j1; j++) used[i][j] = true;
    out.push(best);
  }
}
// Ett takstykke over rektangelet x0–x1, z0–z1. alongX = mønet går langs x. ext = [-x, +x, -z, +z]: utstikk eller forlengelse per side.
function roofPiece(parent, r, box4, alongX, ext, y, wallT, gableMat, lower, joins = [false, false, false, false]) {
  const m = mat(r.material, r.color), a = r.pitch * Math.PI / 180, tan = Math.tan(a);
  const { x0, x1, z0, z1 } = box4, g = new THREE.Group(); parent.add(g);
  // Lokalt: mønet langs lokal x, fra -ex1 til +ex2; tverrsnitt fra -S/2 til S/2.
  // sidene i lokal rekkefølge [-x, +x, -z, +z]; dreid 90° peker lokal +x mot verdens -z og lokal +z mot verdens +x
  const local = a => alongX ? a : [a[3], a[2], a[0], a[1]], [eL, eR, eF, eB] = local(ext), [jL, jR] = local(joins);
  const cxw = (x0 + x1) / 2, czw = (z0 + z1) / 2, L = alongX ? x1 - x0 : z1 - z0, S = alongX ? z1 - z0 : x1 - x0;
  g.position.set(cxw, y - lower, czw); if (!alongX) g.rotation.y = Math.PI / 2;
  const half = S / 2 + wallT / 2, rise = half * tan; // takflaten går gjennom ytterkanten av veggtoppen
  if (r.type === 'flat') {
    mesh(g, prism([[-L / 2 - eL, -S / 2 - eF], [L / 2 + eR, -S / 2 - eF], [L / 2 + eR, S / 2 + eB], [-L / 2 - eL, S / 2 + eB]], 0, .22), m);
    return;
  }
  const xa = -L / 2 - eL, xb = L / 2 + eR, tr = .12;
  if (r.type === 'hip') {
    const oz = Math.max(eF, eB), ez = S / 2 + oz, he = -(oz - wallT / 2) * tan + .005, hr = rise + .005; // 5 mm over veggtoppens ytterkant, så kanten ikke flimrer
    const run = ez, rl = Math.max(0, (xb - xa) / 2 - run), mx = (xa + xb) / 2;
    const A = [xa, he, -ez], B = [xb, he, -ez], C = [xb, he, ez], D = [xa, he, ez], R1 = [mx - rl, hr, 0], R2 = [mx + rl, hr, 0];
    const tris = [[D, C, R2], [D, R2, R1], [B, A, R1], [B, R1, R2], [C, B, R2], [A, D, R1]], side = [0, 0, 0, 0, 1, 1], k = 1 / Math.sin(a);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(tris.flatMap((t, i) => t.flatMap(v => [side[i] ? v[2] : v[0], (v[1] - he) * k])), 2));
    geo.computeVertexNormals();
    const hm = m.clone(); hm.side = THREE.DoubleSide; lit.push(hm); // undersiden synes under takutstikket
    mesh(g, geo, hm);
    return;
  }
  // Saltak: to takflater som møtes i mønet, og gavltrekanter i veggens tykkelse.
  for (const sg of [1, -1]) {
    const o = sg > 0 ? eB : eF, ez = S / 2 + o, he = -(o - wallT / 2) * tan - .02, es = tr * tan; // es: forlengelse forbi mønet så toppene møtes
    const depth = ez / Math.cos(a) + es, c = Math.cos(a), sn = Math.sin(a);
    // underkanten går fra mønet (litt forbi) ned til takfoten; midten av platen ligger en halv tykkelse over den
    const rz = -sg * c * es, ry = rise - .02 + sn * es, mz = (rz + sg * ez) / 2, my = (ry + he) / 2;
    const p = new THREE.Mesh(boxGeo(xb - xa, tr, depth), m); p.castShadow = p.receiveShadow = true;
    p.rotation.x = sg * a; p.position.set((xa + xb) / 2, my + c * tr / 2, mz + sg * sn * tr / 2); g.add(p);
  }
  const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
  for (const [k, join] of [[-1, jL], [1, jR]]) {
    if (join) continue; // enden går inn under et annet tak
    const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: wallT, bevelEnabled: false }), gableMat);
    gm.rotation.y = Math.PI / 2; gm.position.set(k * L / 2 - wallT / 2, 0, 0); gm.castShadow = gm.receiveShadow = true; g.add(gm);
  }
}
let lit = [];
// Alle takstykkene i én gruppe med id 'roof', så et trykk på hvilket som helst av dem velger taket.
function buildRoofs(house) {
  const r = house.roof, g = tag(new THREE.Group(), 'roof', 'roof', 'Tak'), white = mat('maling', '#f4f2ec');
  let y = 0;
  for (const [i, f] of house.floors.entries()) {
    y += f.height;
    const above = house.floors[i + 1], top = !above, rs = outline(f);
    if (!rs || (top && !r)) continue; // uten tak (slettet av brukeren) står øverste etasje åpen
    const ext = f.walls.filter(w => w.exterior), wallT = ext.length ? Math.max(...ext.map(w => w.thickness)) : .2;
    const gableMat = mat(ext[0]?.material || 'panel', ext[0]?.color || '#e9e4d8'), o = r?.overhang ?? .3;
    if (top && (rsRect(rs) || !axisAligned(rs))) { // rektangel eller skrå vegger: ett tak over rektangelet rundt etasjen
      const xs = rs.flat().map(p => p[0]), zs = rs.flat().map(p => p[1]), b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
      box(g, b.x1 - b.x0, .05, b.z1 - b.z0, (b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2, white);
      roofPiece(g, r, b, b.x1 - b.x0 >= b.z1 - b.z0, [o, o, o, o], y, wallT, gableMat, 0);
      continue;
    }
    const c = cells(f, above); if (!c) continue;
    const X = i => c.xs[i], Z = j => c.zs[j], outside = (i, j) => (c.grid[i]?.[j] ?? 0) === 0, range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
    const qs = rects(c.grid, 1, c.xs, c.zs);
    if (!top) { // flatt tak over den delen av etasjen som ikke har etasje over seg; utstikk bare mot det fri
      for (const q of qs) {
        const b = { x0: X(q.i0), x1: X(q.i1), z0: Z(q.j0), z1: Z(q.j1) }, edge = cs => cs.every(([i, j]) => outside(i, j)) ? Math.min(o, .4) : 0;
        const e = [edge(range(q.j0, q.j1).map(j => [q.i0 - 1, j])), edge(range(q.j0, q.j1).map(j => [q.i1, j])), edge(range(q.i0, q.i1).map(i => [i, q.j0 - 1])), edge(range(q.i0, q.i1).map(i => [i, q.j1]))];
        roofPiece(g, { type: 'flat', material: !r || r.material === 'takstein' ? 'betong' : r.material, color: r?.color || '#6e6d69', pitch: 0 }, b, true, e, y, wallT, gableMat, 0);
      }
      continue;
    }
    const placed = [];
    for (const [n, q] of qs.entries()) {
      const b = { x0: X(q.i0), x1: X(q.i1), z0: Z(q.j0), z1: Z(q.j1) }, e = [o, o, o, o], joins = [false, false, false, false];
      box(g, b.x1 - b.x0, .05, b.z1 - b.z0, (b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2, white); // himling
      let alongX = b.x1 - b.x0 >= b.z1 - b.z0;
      // Fløy: ligger stykket inntil et større stykke, går mønet på tvers av skjøten og taket inn under det store taket.
      for (const p of placed) {
        const P = p.b, overX = Math.min(b.z1, P.z1) - Math.max(b.z0, P.z0) > .01, overZ = Math.min(b.x1, P.x1) - Math.max(b.x0, P.x0) > .01;
        const side = overX && Math.abs(b.x1 - P.x0) < 1e-3 ? 1 : overX && Math.abs(b.x0 - P.x1) < 1e-3 ? 0 : overZ && Math.abs(b.z1 - P.z0) < 1e-3 ? 3 : overZ && Math.abs(b.z0 - P.z1) < 1e-3 ? 2 : -1;
        if (side < 0) continue;
        alongX = side < 2;
        const deep = side < 2 ? P.x1 - P.x0 : P.z1 - P.z0;
        e[side] = p.alongX !== alongX ? deep / 2 : Math.min(.3, deep / 2); joins[side] = true;
        break;
      }
      roofPiece(g, r, b, alongX, e, y, wallT, gableMat, n * .01, joins);
      placed.push({ b, alongX });
    }
  }
  return g;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .1, 400);
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
  let dirty = true, byId = {}, inset = [0, 0], last = 0;
  const walk = { on: false, yaw: 0, pitch: 0, move: [0, 0], saved: null, walls: [] };
  // walk.walls: veggstykker [ax, az, bx, bz, r] i etasjen du går i (uten døråpninger). r = halv tykkelse + avstand.
  // Et steg stoppes når det fører nærmere enn r til en vegg. Står du allerede for nært, kan du gå bort fra veggen.
  const dist = (x, z, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
  const blocked = (x, z) => walk.walls.some(w => { const d = dist(x, z, w); return d < w[4] && d < dist(camera.position.x, camera.position.z, w); });
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);

  function theme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    scene.background = new THREE.Color(dark ? '#1c1b19' : '#dfe8ee'); ground.material.color.set(dark ? '#2b2e2a' : '#b9c2ad'); invalidate();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.setViewOffset(w, h, inset[0] / 2, inset[1] / 2, w, h);
    renderer.render(scene, camera); dirty = false; // tegn med en gang, så lerretet aldri vises tomt etter at størrelsen endres
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
        const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw), v = 2.4 * dt, p = camera.position;
        const nx = p.x + (mx * c - mz * s) * v, nz = p.z + (-mx * s - mz * c) * v;
        // Veggene stopper deg; går det ikke rett frem, gli langs veggen.
        const step = [[nx, nz], [nx, p.z], [p.x, nz]].find(([x, z]) => !blocked(x, z));
        if (step) { p.x = step[0]; p.z = step[1]; dirty = true; }
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
        const g = new THREE.Group(); g.name = f.name; g.position.y = y;
        f.rooms.forEach((r, k) => g.add(buildRoom(r, k * .001)));
        const jt = joints(f.walls);
        for (const w of f.walls) g.add(buildWall(w, f.height, jt.get(w), i === 0 ? -.15 : 0));
        for (const m of f.furniture) g.add(buildFurniture(m));
        root.add(g);
      }
      y += f.height;
    }
    if (floor === null) { const roof = buildRoofs(house); if (roof.children.length) root.add(roof); }
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
  // Rammer inn huset. top = bratt vinkel ovenfra (etasjevisning), så veggene ikke skjuler møblene.
  function frame(top = false) {
    if (walk.on) return;
    const b = new THREE.Box3().setFromObject(root); if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1.15 / camera.aspect ** .6 : 1.05);
    controls.target.copy(c); camera.position.copy(c).add((top ? new THREE.Vector3(.1, 1, .2) : new THREE.Vector3(.45, .75, .8)).normalize().multiplyScalar(dist * (top ? .9 : 1)));
    sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(-9, 16, 7)); controls.update(); invalidate();
  }
  // Interiørmodus: kameraet står i øyehøyde og styres med look() og go(). pos.walls = veggstykkene du ikke kan gå gjennom.
  function setWalk(pos) {
    if (pos && !walk.on) walk.saved = { p: camera.position.clone(), t: controls.target.clone() };
    walk.on = !!pos; controls.enabled = !pos; fill.intensity = pos ? .9 : 0; camera.fov = pos ? 75 : 50; walk.move = [0, 0];
    if (pos) { camera.position.set(pos.x, pos.y, pos.z); walk.pitch = 0; if (pos.yaw !== undefined) walk.yaw = pos.yaw; walk.walls = pos.walls || []; }
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
