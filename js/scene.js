// Tegner husets JSON som Three.js-objekter. Hvert rom, vegg, åpning og møbel er et eget objekt med userData.id.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS } from './house.js';

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

function buildRoom(r) {
  const g = tag(new THREE.Group(), r.id, 'room', r.name);
  box(g, r.w, .15, r.d, r.x + r.w / 2, -.15, r.z + r.d / 2, mat(r.material, r.color));
  return g;
}
function buildWall(w, H) {
  const g = tag(new THREE.Group(), w.id, 'wall', 'Vegg'), dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz), t = w.thickness, m = mat(w.material, w.color);
  g.position.set(w.x1, 0, w.z1); g.rotation.y = -Math.atan2(dz, dx);
  let at = -t / 2; // forlenges en halv tykkelse i hver ende så hjørnene lukkes
  const solid = (a, b, y0, y1) => box(g, b - a, y1 - y0, t, (a + b) / 2, y0, 0, m);
  for (const o of [...(w.openings || [])].sort((a, b) => a.pos - b.pos)) {
    const a = Math.max(at, o.pos - o.width / 2), b = Math.min(L + t / 2, o.pos + o.width / 2), top = Math.min(H, o.sill + o.height);
    if (b <= a) continue;
    solid(at, a, 0, H); solid(a, b, 0, o.sill); solid(a, b, top, H); at = b;
    const og = tag(new THREE.Group(), o.id, 'opening', o.type === 'door' ? 'Dør' : 'Vindu'), ww = b - a, hh = top - o.sill, f = .06, fm = mat('maling', o.color);
    og.position.set((a + b) / 2, o.sill, 0);
    if (o.type === 'door') { box(og, ww, hh, .05, 0, 0, 0, mat('tre', o.color)); box(og, .03, .12, .12, ww / 2 - .1, Math.min(1, hh / 2), 0, mat('metall', '#b9b9b4')); }
    else {
      box(og, ww, hh, .02, 0, 0, 0, mat('glass', '#bcd7e6'));
      box(og, ww, f, t + .02, 0, 0, 0, fm); box(og, ww, f, t + .02, 0, hh - f, 0, fm);
      box(og, f, hh, t + .02, -ww / 2 + f / 2, 0, 0, fm); box(og, f, hh, t + .02, ww / 2 - f / 2, 0, 0, fm);
      if (ww > 1) box(og, f * .7, hh, .05, 0, 0, 0, fm);
    }
    g.add(og);
  }
  solid(at, L + t / 2, 0, H);
  return g;
}
const PARTS = { // deler: [w, h, d, x, y, z, fargefaktor eller fast farge]
  sofa: (w, d, h) => [[w, h * .5, d, 0, 0, 0], [w, h * .5, d * .25, 0, h * .5, -d * .375, .9], [w * .1, h * .25, d * .75, -w * .45, h * .5, d * .125, .9], [w * .1, h * .25, d * .75, w * .45, h * .5, d * .125, .9]],
  bord: (w, d, h) => [[w, .05, d, 0, h - .05, 0], ...legs(w, d, h - .05, .06)],
  stol: (w, d, h) => [[w, .05, d, 0, h * .5, 0], [w, h * .45, .05, 0, h * .55, -d / 2 + .025], ...legs(w, d, h * .5, .04)],
  seng: (w, d, h) => [[w, h * .3, d, 0, 0, 0, .7], [w * .96, h * .25, d * .97, 0, h * .3, d * .01], [w, h, .08, 0, 0, -d / 2 + .04, .7], [w * .8, .1, .45, 0, h * .55, -d / 2 + .4, '#f4f1ea']],
  skap: (w, d, h) => [[w, h, d, 0, 0, 0], [.02, h * .9, .02, 0, h * .05, d / 2 + .01, .6]],
  plante: (w, d, h) => [[w * .6, h * .3, d * .6, 0, 0, 0, '#b8a691'], [w, h * .6, d, 0, h * .4, 0], [.05, h * .12, .05, 0, h * .3, 0, '#5b4632']],
};
const legs = (w, d, h, s) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [s, h, s, a * (w / 2 - s), 0, b * (d / 2 - s), .75]);
function buildFurniture(f) {
  const g = tag(new THREE.Group(), f.id, 'furniture', f.type);
  g.position.set(f.x, 0, f.z); g.rotation.y = -(f.rot || 0) * Math.PI / 180;
  for (const [w, h, d, x, y, z, c] of (PARTS[f.type] || ((w, d, h) => [[w, h, d, 0, 0, 0]]))(f.w, f.d, f.h))
    box(g, w, h, d, x, y, z, mat(f.material, typeof c === 'string' ? c : c ? shade(f.color, c) : f.color));
  return g;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .05, 300);
  const root = new THREE.Group(); root.name = 'Hus'; scene.add(root);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8578', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; ground.receiveShadow = true; scene.add(ground);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - .02; controls.minDistance = 1; controls.maxDistance = 80;
  let dirty = true, byId = {}, lit = [], inset = [0, 0];
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);

  function theme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    scene.background = new THREE.Color(dark ? '#1c1b19' : '#e9edf0'); ground.material.color.set(dark ? '#2b2e2a' : '#b9c2ad'); invalidate();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.setViewOffset(w, h, inset[0] / 2, inset[1] / 2, w, h); invalidate();
  }
  // Flytter bildet så huset står midt i den delen av skjermen som panelet ikke dekker.
  function setInset(right, bottom) { if (right === inset[0] && bottom === inset[1]) return; inset = [right, bottom]; resize(); }
  new ResizeObserver(resize).observe(canvas);
  (function loop() { requestAnimationFrame(loop); if (dirty) { dirty = false; renderer.render(scene, camera); } })();

  function build(house) {
    root.traverse(o => o.geometry?.dispose()); lit.forEach(m => m.dispose()); lit = []; root.clear(); byId = {};
    let y = 0;
    for (const f of house.floors) {
      const g = new THREE.Group(); g.name = f.name; g.position.y = y; y += f.height;
      for (const r of f.rooms) g.add(buildRoom(r));
      for (const w of f.walls) g.add(buildWall(w, f.height));
      for (const m of f.furniture) g.add(buildFurniture(m));
      root.add(g);
    }
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
    const b = new THREE.Box3().setFromObject(root); if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1.15 / camera.aspect ** .6 : 1.05);
    controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(.45, .75, .8).normalize().multiplyScalar(dist));
    sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(-9, 16, 7)); controls.update(); invalidate();
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function aim(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(e) {
    aim(e);
    for (const h of ray.intersectObject(root, true)) for (let o = h.object; o && o !== root; o = o.parent) if (o.userData.id) return o.userData.id;
    return null;
  }
  function planePoint(e, y) { aim(e); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()); }
  theme(); resize();
  return { build, select, frame, setInset, pick, planePoint, theme, invalidate, controls, camera, root, renderer };
}
