// Tegner husets JSON som Three.js-objekter. Hvert rom, vegg, åpning og møbel er et eget objekt med userData.id.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
    const g = new THREE.MeshStandardMaterial({ color, roughness: .05, transparent: true, opacity: .4, envMapIntensity: 2.5, emissive: GLOW, emissiveIntensity: glow });
    glassMats.push(g); return matCache[key] = g;
  }
  return matCache[key] = new THREE.MeshStandardMaterial({ color, roughness: m.rough, metalness: m.metal || 0, map: texture(material) });
}
const GLOW = new THREE.Color('#ffc98a'), glassMats = []; let glow = 0;
function setGlow(v) { if (v === glow) return; glow = v; for (const g of glassMats) g.emissiveIntensity = v; }
const shade = (color, k) => '#' + new THREE.Color(color).multiplyScalar(k).getHexString();
// Boks med UV i meter, lagt ut fra plasseringen i forelderen, så mønstrene får riktig målestokk og går i ett over flere biter.
// r = avrundede kanter (noen millimeter fanger lyset på kantene, så delene ikke ser skarpe og dataaktige ut).
const R = .004;
function boxGeo(w, h, d, r = 0, o = [0, 0, 0]) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = r > .0005 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d), p = g.attributes.position, uv = g.attributes.uv, per = p.count / 6;
  for (let i = 0; i < p.count; i++) { // sidene ligger i rekkefølgen +x, −x, +y, −y, +z, −z
    const x = p.getX(i) + o[0], y = p.getY(i) + o[1], z = p.getZ(i) + o[2], f = Math.floor(i / per);
    if (f < 2) uv.setXY(i, f ? z : -z, y); else if (f < 4) uv.setXY(i, x, f === 2 ? -z : z); else uv.setXY(i, f === 4 ? x : -x, y);
  }
  return g;
}
// x,z = senter, y = underkant
function box(parent, w, h, d, x, y, z, material, r = 0) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  const m = new THREE.Mesh(boxGeo(w, h, d, r, [x, y + h / 2, z]), material);
  m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
// Et profil [d, y] trukket langs x fra x0 til x1. d måles fra z0 i retning side (lokal z). Til lister, sokkel, beslag og takrenner.
function prism(parent, profile, x0, x1, material, z0 = 0, side = 1) {
  if (x1 - x0 < .005) return;
  let pts = profile.map(([d, y]) => [z0 + side * d, y]), area = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; });
  if (area > 0) pts = pts.reverse(); // med klokka i (z, y), så sideflatene vender utover
  const pos = [], uv = [];
  let run = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    pos.push(x0, p[1], p[0], x0, q[1], q[0], x1, q[1], q[0], x0, p[1], p[0], x1, q[1], q[0], x1, p[1], p[0]);
    uv.push(x0, run, x0, run + l, x1, run + l, x0, run, x1, run + l, x1, run); run += l;
  });
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts.map(([z, y]) => new THREE.Vector2(z, y)), [])) {
    const [pa, pb, pc] = [pts[a], pts[b], pts[c]], cw = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) < 0;
    for (const [x, ks] of [[x1, cw ? [a, b, c] : [a, c, b]], [x0, cw ? [a, c, b] : [a, b, c]]]) for (const k of ks) { pos.push(x, pts[k][1], pts[k][0]); uv.push(pts[k][0], pts[k][1]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
// Rør fra punkt a til b (nedløp).
function pipe(parent, a, b, r, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B); if (L < .005) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 12), material);
  m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  m.castShadow = m.receiveShadow = true; parent.add(m);
}
function tag(obj, id, kind, name) { obj.userData = { id, kind }; obj.name = name || kind; return obj; }

// lift = hvor mye gulvet ligger over veggtoppene i etasjen under, så de to flatene ikke havner i samme plan.
function buildRoom(r, lift = 0) {
  const g = tag(new THREE.Group(), r.id, 'room', r.name);
  box(g, r.w, .15 + lift, r.d, r.x + r.w / 2, -.15, r.z + r.d / 2, mat(r.material, r.color));
  return g;
}
// Hvordan hver veggende møter naboene. e = hvor mye enden forlenges (+) eller kortes (-) så hjørner og T-kryss lukkes uten at
// veggene overlapper. Rette hjørner: den tykkeste veggen går helt ut, den andre butter mot den. T-kryss: veggen stopper mot flaten
// på den gjennomgående. kind = 'corner' | 't' | 'straight' | 'skew' | 'free', cs = siden (lokal z, ±1) hjørneveggen går til.
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
        else { const side = Math.sign(dir * (A.ux * B.uz - A.uz * B.ux)) || 1; sides |= side > 0 ? 1 : 2; if (!corner || B.t > corner.t) corner = { t: B.t, ib, side }; }
      } else if (Math.abs(dot) > .998) { if (dir && dot * dir > 0) straight = true; }
      else skew = true;
    });
    if (sides === 3) through = Math.max(through, corner.t);
    if (through) return { e: -through / 2, kind: 't' };
    if (straight) return { e: 0, kind: 'straight' };
    if (corner) return { e: (A.t > corner.t || (A.t === corner.t && ia < corner.ib) ? 1 : -1) * corner.t / 2, kind: 'corner', cs: corner.side };
    return { e: skew ? A.t / 2 : 0, kind: skew ? 'skew' : 'free' };
  }));
}
// Hvor langt en flate på side s (lokal z) av veggen går forbi enden, når en list med fremspring p skal møte listen på naboveggen:
// innerhjørner stopper den ene listen mot den andre, ytterhjørner går rundt.
function faceEnd(j, s, p) {
  if (j.cs) return s === j.cs ? (j.e > 0 ? -j.e - p : j.e) : (j.e > 0 ? j.e + p : -j.e);
  return j.kind === 't' ? j.e - p : j.e;
}
// Hvor mye en avrundet veggende stikker inn i naboen, så rundingen der skjules og bare de frie kantene blir runde.
const tuck = j => j.kind === 'straight' ? R : j.kind === 't' || (j.kind === 'corner' && j.e < 0) ? 2 * R : 0;

const TRIM = '#f3f1ec', GW = .065, GT = .018; // listverk inne: farge, bredde og tykkelse på gerikt
const SKIRT = [[0, 0], [.013, 0], [.013, .056], [.01, .066], [.005, .07], [0, .07]]; // gulvlist
const CROWN = [[0, 0], [0, -.06], [.01, -.06], [.012, -.05], ...Array.from({ length: 7 }, (_, i) => { const a = Math.PI - i / 6 * Math.PI / 2; return [.04 + .028 * Math.cos(a), -.05 + .028 * Math.sin(a)]; }), [.05, -.02], [.05, 0]]; // taklist med hulkil
const SOCKLE = (top, p = .025) => [[0, -.17], [p, -.17], [p, top - .015], [p - .004, top - .005], [p - .013, top], [0, top]];
const isWood = m => m === 'panel' || m === 'tre';

// ctx = { floor, trim (farge på utvendig listverk), center (etasjens midtpunkt), ceil (himlingshøyden), ground (nederste etasje) }.
// base = hvor langt veggen går ned forbi gulvet (nederste etasje dekker kanten av gulvplaten).
function buildWall(w, H, [J0, J1], base, ctx) {
  const g = tag(new THREE.Group(), w.id, 'wall', 'Vegg'), dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz), t = w.thickness, m = mat(w.material, w.color), ux = dx / L, uz = dz / L;
  g.position.set(w.x1, 0, w.z1); g.rotation.y = -Math.atan2(dz, dx);
  // Lokale koordinater: x langs veggen fra (x1, z1), z på tvers. Rommet som ligger i et punkt, og hvilken side som er ute.
  const room = (x, z) => { const px = w.x1 + ux * x - uz * z, pz = w.z1 + uz * x + ux * z; return ctx.floor.rooms.find(r => px > r.x && px < r.x + r.w && pz > r.z && pz < r.z + r.d); };
  let out = 0;
  if (w.exterior) {
    const a = room(L / 2, -t / 2 - .2), b = room(L / 2, t / 2 + .2);
    out = a && !b ? 1 : b && !a ? -1 : (ctx.center[0] - w.x1 - ux * L / 2) * -uz + (ctx.center[1] - w.z1 - uz * L / 2) * ux > 0 ? -1 : 1;
  }
  const inner = out ? [-out] : [-1, 1], x0 = -J0.e - tuck(J0), x1 = L + J1.e + tuck(J1);
  // Veggen bygges av biter rundt åpningene. Bitene under og over en åpning stikker 2R inn i nabobitene, så skjøtene ikke synes.
  const solid = (a, b, y0, y1) => box(g, b - a, y1 - y0, t, (a + b) / 2, y0, 0, m, R);
  const ops = [];
  let at = x0;
  for (const o of [...(w.openings || [])].sort((a, b) => a.pos - b.pos)) {
    const a = Math.max(at, o.pos - o.width / 2), b = Math.min(x1, o.pos + o.width / 2), sill = Math.min(o.sill, H - .3), top = Math.min(H, sill + o.height);
    if (b - a < .05) continue;
    const ia = Math.max(x0, a - 2 * R), ib = Math.min(x1, b + 2 * R);
    solid(at, a, -base, H); if (sill + base > .01) solid(ia, ib, -base, sill); if (H - top > .01) solid(ia, ib, top, H); at = b;
    // Dører slår inn i det største rommet. Ytterdører slår utover, som vanlig i Norge.
    const area = r => r ? r.w * r.d : 0, ra = area(room(o.pos, -t / 2 - .3)), rb = area(room(o.pos, t / 2 + .3));
    g.add(buildOpening(o, b - a, top - sill, { t, out, inner, s: out || (ra > rb ? -1 : 1), wood: w.exterior && isWood(w.material), trim: ctx.trim }).translateX((a + b) / 2).translateY(sill));
    ops.push({ a, b, sill, top, door: o.type === 'door' });
  }
  solid(at, x1, -base, H);
  // Lister langs flatene som vender inn i rom, avbrutt av åpningene og listverket rundt dem.
  const runs = (s, p, gaps) => {
    let a = -faceEnd(J0, s, p); const b = L + faceEnd(J1, s, p), res = [];
    for (const [g0, g1] of gaps.sort((x, y) => x[0] - y[0])) { if (g0 > a) res.push([a, Math.min(b, g0)]); a = Math.max(a, g1); }
    if (b > a) res.push([a, b]);
    return res.filter(([x, y]) => y - x > .02);
  };
  const tm = mat('maling', TRIM);
  for (const s of inner) {
    for (const [a, b] of runs(s, .013, ops.filter(o => o.sill < .09).map(o => [o.a + .01 - GW + .005, o.b - .01 + GW - .005]))) prism(g, SKIRT, a, b, tm, s * t / 2, s);
    if (ctx.ceil < H + .01) for (const [a, b] of runs(s, .05, ops.filter(o => o.top + GW > ctx.ceil - .07).map(o => [o.a + .01 - GW, o.b - .01 + GW])))
      prism(g, CROWN.map(([d, y]) => [d, y + ctx.ceil]), a, b, tm, s * t / 2, s);
  }
  // Sokkel nederst på ytterveggene, lavere under dørene så den blir et trinn opp til terskelen.
  if (ctx.ground && out) {
    const sm = mat('betong', '#9a968e'), doors = ops.filter(o => o.door && o.sill < .12);
    for (const [a, b] of runs(out, .025, doors.map(o => [o.a, o.b]))) prism(g, SOCKLE(.12), a, b, sm, out * t / 2, out);
    for (const o of doors) prism(g, SOCKLE(-.012, .03), o.a, o.b, sm, out * t / 2, out);
  }
  return g;
}
// Dør eller vindu med karm, foring og listverk. Koordinater fra midten av åpningen nede, z på tvers av veggen.
// c = { t: veggtykkelse, out: siden som er ute (0 = innervegg), inner: sidene som vender inn i rom, s: siden døren slår mot, wood, trim }
function buildOpening(o, ww, hh, { t, out, inner, s, wood, trim }) {
  const og = tag(new THREE.Group(), o.id, 'opening', o.type === 'door' ? 'Dør' : 'Vindu'), fm = mat(o.material, o.color), tm = mat('maling', TRIM);
  // Gerikt: lister rundt åpningen på flaten på side side, nederst fra y0. Utvendig omramming på trehus er det samme, bare bredere.
  const around = (side, gw, gt, material, y0) => {
    const z = side * (t / 2 + gt / 2), xi = ww / 2 - .01, y1 = hh - .01 + gw;
    for (const sg of [-1, 1]) box(og, gw, y1 - y0, gt, sg * (xi + gw / 2), y0, z, material, R);
    box(og, 2 * xi, gw, gt, 0, hh - .01, z, material, R);
    if (y0 < 0) box(og, 2 * xi, gw, gt, 0, y0, z, material, R);
  };
  if (o.type === 'window') {
    // Karmen står et stykke inn i veggen, nærmest utsiden. Innenfor: foring i smygen, vinduskarm og gerikt. Utenfor: beslag.
    const f = .06, fd = Math.min(.11, t - .02), zc = out * Math.max(0, t / 2 - .03 - fd / 2), low = o.sill < .05;
    box(og, ww, f, fd, 0, 0, zc, fm, R); box(og, ww, f, fd, 0, hh - f, zc, fm, R);
    for (const sg of [-1, 1]) box(og, f, hh - f * 2, fd, sg * (ww / 2 - f / 2), f, zc, fm, R);
    if (ww > 1) box(og, f * .7, hh - f * 2, fd * .8, 0, f, zc, fm, R);
    box(og, ww - f * 2 + .02, hh - f * 2 + .02, .012, 0, f - .01, zc, mat('glass', '#bcd7e6'));
    for (const si of inner) {
      const zf = zc + si * fd / 2, deep = si * t / 2 - zf, zm = zf + deep / 2;
      if (Math.abs(deep) > .005) {
        for (const sg of [-1, 1]) box(og, .016, hh, Math.abs(deep), sg * (ww / 2 - .008), 0, zm, tm, R);
        box(og, ww - .032, .016, Math.abs(deep), 0, hh - .016, zm, tm, R);
      }
      if (!low) { const d = Math.abs(si * (t / 2 + .035) - zf); box(og, ww + GW * 2 + .04, .022, d, 0, -.004, zf + si * d / 2, tm, R); }
      around(si, GW, GT, tm, low ? 0 : .018);
    }
    if (out) {
      const dw = t / 2 - Math.abs(zc) - fd / 2;
      if (!low) prism(og, [[0, .012], [dw + .045, -.02], [dw + .045, -.05], [dw + .038, -.05], [dw + .038, -.027], [0, -.004]], -ww / 2 - .025, ww / 2 + .025, mat('metall', o.color), zc + out * fd / 2, out);
      if (wood) around(out, .1, .022, mat('maling', o.color), low ? 0 : -.09);
    }
  } else {
    // Karm med anslag på siden døren slår mot, foring i resten av smygen, terskel og gerikt. Dørbladet dreies rundt hengslene.
    const kw = .045, kd = Math.min(t, .1), lt = .04, kz = s * (t / 2 - kd / 2), km = mat('maling', out ? trim : TRIM);
    for (const sg of [-1, 1]) box(og, kw, hh, kd, sg * (ww / 2 - kw / 2), 0, kz, km, R);
    box(og, ww - kw * 2, kw, kd, 0, hh - kw, kz, km, R);
    if (t - kd > .005) {
      for (const sg of [-1, 1]) box(og, .016, hh, t - kd, sg * (ww / 2 - .008), 0, -s * kd / 2, tm, R);
      box(og, ww - .032, .016, t - kd, 0, hh - .016, -s * kd / 2, tm, R);
    }
    const lw = ww - kw * 2 - .006, lh = hh - kw - .016, face = s * (t / 2 - .004), sz = face - s * (lt + .007);
    for (const sg of [-1, 1]) box(og, .012, hh - kw, .014, sg * (ww / 2 - kw - .006), 0, sz, km);
    box(og, ww - kw * 2, .012, .014, 0, hh - kw - .012, sz, km);
    box(og, ww - kw * 2, .014, kd, 0, 0, kz, mat('tre', '#b89a74'), R);
    // Hengslene sitter på flaten døren slår mot. swing = hengslenes side sett fra den siden.
    const hs = (o.swing === 'right' ? 1 : -1) * s, hx = hs * (ww / 2 - kw - .003), leaf = new THREE.Group(), hm = mat('metall', '#b9b9b4');
    leaf.name = 'Dørblad'; leaf.position.set(hx, .014, face); leaf.rotation.y = s * hs * (o.open || 0) * Math.PI / 180;
    const panel = box(leaf, lw, lh, lt, -hs * lw / 2, 0, -s * lt / 2, fm, R); if (panel) panel.userData.occludes = true; // et lukket dørblad skjuler romnavnet bak seg, et åpent gjør det ikke
    const kx = -hs * (lw - .065), ky = Math.min(1, lh * .5);
    for (const sg of [-1, 1]) {
      const zf = -s * lt / 2 + sg * lt / 2;
      box(leaf, .045, .16, .008, kx, ky - .1, zf + sg * .004, hm, .002);
      box(leaf, .018, .018, .045, kx, ky - .009, zf + sg * .022, hm);
      box(leaf, .13, .02, .02, kx + hs * .055, ky - .01, zf + sg * .045, hm, .006);
    }
    for (const y of [.2, lh - .3]) box(leaf, .014, .1, .014, 0, y, 0, hm);
    og.add(leaf);
    for (const si of inner) around(si, GW, GT, tm, 0);
    if (out && wood) around(out, .1, .022, mat('maling', trim), 0);
  }
  return og;
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
    c === 'glass' ? box(g, w, h, d, x, y, z, mat('glass', '#bcd7e6')) : box(g, w, h, d, x, y, z, mat(f.material, typeof c === 'string' ? c : c ? shade(f.color, c) : f.color), R);
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
// Takrenne: halvrund, tverrsnitt [ut fra takfoten, ned fra takflaten].
const GUTTER = [...Array.from({ length: 11 }, (_, i) => { const a = Math.PI + i / 10 * Math.PI; return [.05 + .065 * Math.cos(a), -.012 + .065 * Math.sin(a)]; }),
  ...Array.from({ length: 11 }, (_, i) => { const a = 2 * Math.PI - i / 10 * Math.PI; return [.05 + .059 * Math.cos(a), -.012 + .059 * Math.sin(a)]; })];
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
    const roofFaces = [], gableFaces = [], gutters = [], downpipes = [];
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
      const pieces = cuts.slice(0, -1).map((v0, m) => ({ v0, v1: cuts[m + 1], uL: -edgeAt(fl[m]), uR: edgeAt(fr[m]), kL: fl[m], kR: fr[m] }));
      for (let m = pieces.length - 1; m > 0; m--) if (['uL', 'uR', 'kL', 'kR'].every(k => pieces[m][k] === pieces[m - 1][k])) { pieces[m - 1].v1 = pieces[m].v1; pieces.splice(m, 1); }
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
          if (!flat) P.forEach((a, m) => { // takrenne langs takfoten der den vender ut mot friluft
            const b = P[(m + 1) % P.length], h = top(...a) - thick;
            if (!eq(top(...a), top(...b))) return;
            const side = eq(a[0], b[0]) ? (eq(a[0], q.uL) && q.kL === 'free' ? -1 : eq(a[0], q.uR) && q.kR === 'free' ? 1 : 0) : 0;
            const end = !side && eq(a[1], b[1]) ? (eq(a[1], vA) && A.hip && A.free ? -1 : eq(a[1], vB) && B.hip && B.free ? 1 : 0) : 0;
            if (!side && !end) return;
            // Ved et valmet hjørne går rennene helt ut i hjørnet, så de møtes.
            const corner = p => side ? (eq(p[1], vA) && A.hip) || (eq(p[1], vB) && B.hip) : eq(p[0], q.uL) || eq(p[0], q.uR);
            gutters.push([M(a[0], a[1], h), M(b[0], b[1], h), side ? dir(side, 0) : dir(0, end), corner(a), corner(b)]);
            if (!side) return;
            // Nedløp ved hjørnene: fra rennen, på skrå inn til veggen og ned til bakken. Ikke der et lavere tak ligger under.
            const cells = edge[side < 0 ? sL : sR];
            for (const [v, endA] of [[a[1], true], [b[1], true], [a[1], false], [b[1], false]]) {
              const e = endA ? A : B;
              if (!e.free || !eq(v, endA ? vA : vB)) continue;
              const c = cells[endA ? 0 : cells.length - 1]; if (inside.slice(0, f).some(g => cell(g, c[0], c[1]))) continue;
              const vp = endA ? c0 - t / 2 + .15 : c1 + t / 2 - .15, ug = side * (Math.abs(a[0]) + .05), uw = side * (p.span / 2 + t / 2 + .055), hg = h - .08;
              const pts = [[ug, hg + .04], [ug, hg - .1], [uw, hg - .1 - Math.abs(ug - uw)], [uw, -.16 + .2], [uw + side * .14, -.16 + .07]];
              if (pts[2][1] > pts[3][1]) downpipes.push(pts.map(([u, hh]) => M(u, vp, hh)));
            }
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
    const gm = mat('metall', r.color);
    for (const [a, b, out, ca, cb] of gutters) {
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz); if (L < .05) continue;
      const g = new THREE.Group(); g.position.set(...a); g.rotation.y = -Math.atan2(dz, dx);
      prism(g, GUTTER, ca ? -.115 : 0, L + (cb ? .115 : 0), gm, 0, Math.sign(-dz * out[0] + dx * out[2]) || 1); group.add(g);
    }
    for (const pts of downpipes) {
      pts.slice(1).forEach((b, n) => pipe(group, pts[n], b, .04, gm));
      for (const p of pts.slice(1, -1)) { const k = new THREE.Mesh(new THREE.SphereGeometry(.04, 12, 8), gm); k.position.set(...p); k.castShadow = true; group.add(k); }
    }
  });
  return group.children.length ? group : null;
}

// Omgivelseskart: himmel som blir lysere mot horisonten, og bakke under. Gir mykt lys fra alle kanter og noe å speile i glass og metall.
function skyEnvironment(renderer) {
  const geo = new THREE.SphereGeometry(10, 48, 24), pos = geo.attributes.position, col = [], c = new THREE.Color();
  const zenith = new THREE.Color('#a9c1dc'), horizon = new THREE.Color('#f2f2ee'), ground = new THREE.Color('#7d776c'); // nesten nøytralt, så fargene på huset ikke forskyves
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, .6)); else c.copy(horizon).lerp(ground, Math.min(1, -h * 6));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const sky = new THREE.Scene(); sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d8').multiplyScalar(6) }));
  sun.position.set(-9, 16, 7).setLength(9); sky.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(sky, .02).texture;
  pmrem.dispose(); geo.dispose();
  return env;
}
// Three.js' filmiske ACES-kurve. Brukes baklengs på bakgrunnen, så den får akkurat den fargen vi ber om etter tonemappingen.
const IN = [.59719, .076, .0284, .35458, .90834, .13383, .04823, .01566, .83777], OUT = [1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602];
const mul = (m, [r, g, b]) => [m[0] * r + m[3] * g + m[6] * b, m[1] * r + m[4] * g + m[7] * b, m[2] * r + m[5] * g + m[8] * b];
const fit = v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .432951) + .238081);
const aces = (c, e) => mul(OUT, mul(IN, c.map(v => v * e / .6)).map(fit)).map(v => Math.min(1, Math.max(0, v)));
function untone(hex, exposure) {
  const t = new THREE.Color(hex).toArray(); let x = [...t];
  for (let i = 0; i < 60; i++) { const y = aces(x, exposure); x = x.map((v, k) => Math.max(0, v + (t[k] - y[k]) * 1.5)); }
  return new THREE.Color().fromArray(x);
}
// Kontaktskygger. Glass tas ikke med (det skal ikke få skygge selv), og skyggen regnes ut i omtrent én prikk per CSS-piksel.
class ContactShadows extends GTAOPass {
  scale = 1;
  overrideVisibility() { super.overrideVisibility(); this.scene.traverse(o => { if (o.material?.transparent || o.userData.noAO) o.visible = false; }); }
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }
}


// Lysstemninger. Dag: høy sol og lys himmel. Kveld: lav, varm sol, mørkeblå himmel og lys i rommene (den blå timen).
const MOODS = {
  day: { top: '#7ea4cd', mid: '#c4d6e6', horizon: '#eef1ec', ground: '#b5c4a2', sun: ['#fff4e0', 2], sunAt: [-9, 16, 7], hemi: ['#ffffff', '#8a8578', 1], env: .5, lamps: 0, exposure: 1 },
  evening: { top: '#1a3160', mid: '#6d90c2', horizon: '#efbb92', ground: '#5a6656', sun: ['#ffa468', 1], sunAt: [-16, 4.5, 10], hemi: ['#86a0d4', '#3a3632', 2.6], env: .35, lamps: 1, exposure: 1.05 },
};
// Himmel som følger kameraet: lys mot horisonten, mørkere opp mot toppen. Bakken tones inn i horisonten med dis.
function skyDome() {
  const m = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, horizon; varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h < .18 ? mix(horizon, mid, smoothstep(-.02, .18, h)) : mix(mid, top, pow((h - .18) / .82, .8));
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m);
  s.frustumCulled = false; s.renderOrder = -1; s.userData.noAO = true; return s;
}
const fwd = yaw => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
const ease = k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
const MAX_LAMPS = matchMedia('(pointer: coarse)').matches ? 6 : 10;

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; // filmisk: myke høylys i stedet for utbrent hvitt
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .05, 300);
  // Omgivelseskartet og kontaktskyggene trenger flyttall-bilder. Eldre mobiler uten dem får det enkle himmellyset fra før.
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  if (hdr) { scene.environment = skyEnvironment(renderer); scene.environmentIntensity = .5; }
  const root = new THREE.Group(); root.name = 'Hus'; scene.add(root);
  const lamps = new THREE.Group(); lamps.name = 'Taklamper'; scene.add(lamps); // utenfor root: tas ikke med i valg eller GLB-eksport
  const sky = skyDome(); scene.add(sky);
  scene.fog = new THREE.Fog('#ffffff', 45, 130);
  const fill = new THREE.AmbientLight('#fff1e0', 0), hemi = new THREE.HemisphereLight('#ffffff', '#8a8578', hdr ? .3 : 1.5);
  scene.add(hemi, fill);
  const sun = new THREE.DirectionalLight('#fff4e0', 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 90 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), new THREE.MeshStandardMaterial({ roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; ground.receiveShadow = true; scene.add(ground);
  // Etterbehandling: scenen (med kantutjevning) → kontaktskygger → tonemapping og fargerom.
  // Uten flyttall-bilder tegnes scenen rett ut, fortsatt med tonemapping, men uten kontaktskygger.
  let composer = null, ao = null;
  if (hdr) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    ao = new ContactShadows(scene, camera, 1, 1, undefined, { radius: .4, distanceExponent: 1.5, thickness: .3, distanceFallOff: .5, scale: 1.6, samples: 16 }, { radius: 4, radiusExponent: 1, samples: 16 });
    composer.addPass(new RenderPass(scene, camera)); composer.addPass(ao); composer.addPass(new OutputPass());
  }
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = 1; controls.maxDistance = 90;
  let dirty = true, byId = {}, lit = [], inset = [0, 0], last = 0, mode = 'orbit', flight = null, mood = MOODS.day;
  let shown = { house: null, floor: null }, focusY = null, occluders = [];
  const center = new THREE.Vector3();
  const walk = { yaw: 0, pitch: 0, move: [0, 0], saved: null };
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    const pr = Math.min(devicePixelRatio, 2); renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    if (composer) { ao.scale = 1 / pr; composer.setPixelRatio(pr); composer.setSize(w, h); }
    camera.aspect = w / h; if (mode === 'walk' && !flight) camera.fov = walkFov();
    camera.setViewOffset(w, h, inset[0] / 2, inset[1] / 2, w, h); invalidate();
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
    if (dirty) {
      dirty = false; sky.position.copy(camera.position);
      composer ? composer.render(dt) : renderer.render(scene, camera);
      api.onFrame?.();
    }
  });

  // Taklamper: et varmt lys midt i taket i hvert rom. Om kvelden overalt, inne i huset også på dagtid.
  // Antallet er begrenset (hvert lys koster på mobil), og rommene nærmest etasjen du står i får lys først.
  const discGeo = new THREE.CylinderGeometry(.17, .17, .012, 24), discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0d8').multiplyScalar(4) });
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
      const A = r.w * r.d, cx = r.x + r.w / 2, cz = r.z + r.d / 2, ceil = y + H - (top ? .1 : .15);
      const l = new THREE.PointLight('#ffd3a3', (mood.lamps ? 4.5 : 2.2) * Math.min(2.2, Math.max(.6, A / 12)), Math.max(r.w, r.d) * .9 + 1.5, 2);
      l.position.set(cx, ceil - .7, cz); lamps.add(l); // litt under taket, så taket rundt lampen ikke brenner ut
      if (ceiling) { const d = new THREE.Mesh(discGeo, discMat); d.position.set(cx, ceil - .006, cz); lamps.add(d); }
    }
  }
  function placeSun() { sun.target.position.copy(center); sun.position.copy(center).add(new THREE.Vector3(...mood.sunAt)); }
  function setMood(name) {
    mood = MOODS[name] || MOODS.day;
    const tone = hex => untone(hex, mood.exposure), u = sky.material.uniforms;
    renderer.toneMappingExposure = mood.exposure;
    u.top.value.copy(tone(mood.top)); u.mid.value.copy(tone(mood.mid)); u.horizon.value.copy(tone(mood.horizon)); scene.fog.color.copy(u.horizon.value);
    ground.material.color.set(mood.ground);
    sun.color.set(mood.sun[0]); sun.intensity = mood.sun[1];
    hemi.color.set(mood.hemi[0]); hemi.groundColor.set(mood.hemi[1]); hemi.intensity = (hdr ? .3 : 1.5) * mood.hemi[2];
    if (hdr) scene.environmentIntensity = mood.env;
    placeSun(); lights(); invalidate();
  }
  // Lys som avhenger av både stemning og om du er inne: lamper, glødende ruter (bare sett utenfra) og fyllys inne.
  function lights() {
    updateLamps(); setGlow(mood.lamps && mode === 'orbit' ? .9 : 0);
    fill.intensity = mode === 'walk' ? (mood.lamps ? .25 : .55) : 0; invalidate();
  }

  // floor = null viser hele huset med tak. Et tall viser etasjene til og med den, uten tak, så du ser ned i rommene.
  function build(house, { floor = null } = {}) {
    root.traverse(o => o.geometry?.dispose()); lit.forEach(m => m.dispose()); lit = []; root.clear(); byId = {};
    let y = 0;
    for (const [i, f] of house.floors.entries()) {
      if (floor === null || i <= floor) {
        const g = new THREE.Group(), ends = joints(f.walls), b = bounds(f); g.name = f.name; g.position.y = y;
        // Utvendig listverk rundt dører får samme farge som vinduene i etasjen. Himlingen: taket eller gulvplaten i etasjen over.
        const ctx = { floor: f, trim: f.walls.flatMap(w => w.openings).find(o => o.type === 'window')?.color ?? '#f2efe8', center: b ? [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2] : [0, 0],
          ceil: f.height - (i === house.floors.length - 1 ? .1 : .15), ground: !i };
        for (const r of f.rooms) g.add(buildRoom(r, i ? .004 : 0));
        f.walls.forEach((w, n) => g.add(buildWall(w, f.height, ends[n], i ? 2 * R : .14, ctx))); // øvre etasjer stikker litt ned i veggene under, så skjøten ikke synes
        for (const m of f.furniture) g.add(buildFurniture(m));
        root.add(g);
      }
      y += f.height;
    }
    const roof = buildRoof(house, floor); if (roof) root.add(roof);
    root.traverse(o => { if (o.userData.id) byId[o.userData.id] = o; });
    // Det som kan skjule et romnavn: vegger, gulv, tak og dørblad. Ikke karmer, vinduer, glass og møbler.
    occluders = [];
    root.traverse(o => {
      if (!o.isMesh || o.material.transparent) return;
      if (o.userData.occludes) return occluders.push(o);
      for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.kind === 'opening' || p.userData.kind === 'furniture') return;
      occluders.push(o);
    });
    // Kontaktskyggene regnes bare ut rundt huset, ikke ut over hele bakken.
    if (ao) { const b = new THREE.Box3().setFromObject(root); ao.setSceneClipBox(b.isEmpty() ? null : b.expandByScalar(1)); }
    shown = { house, floor }; updateLamps(); invalidate();
  }
  function select(id) {
    const o = byId[id]; if (!o) return;
    o.traverse(m => { // bare delene som hører til objektet selv, ikke dører og vinduer i en valgt vegg
      let p = m.parent; while (p && !p.userData.id) p = p.parent;
      if (!m.isMesh || p !== o) return;
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
    center.copy(c); placeSun();
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
