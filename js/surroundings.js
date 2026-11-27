// Omgivelser rundt huset: gressplen, gangsti fram til ytterdøren, vei, trær, busker, skogkant og åser mot horisonten.
// Alt ligger utenfor husets root, så ingenting her kan velges, redigeres eller kommer med i GLB-eksporten. Ingenting lagres heller:
// omgivelsene regnes ut fra huset (grunnflate og ytterdør) hver gang det endres, og plasseringen er fast for samme hus.
import * as THREE from 'three';
import { bounds, wallLength } from './house.js';

const rand = s => () => (s = s * 16807 % 2147483647) / 2147483647;
const canvas = n => Object.assign(document.createElement('canvas'), { width: n, height: n });
// Tegner noe som går over kanten av flisen også på motsatt side, så teksturen gjentas uten skjøter.
function wrapped(S, x, y, pad, fn) { for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) if ((!dx || Math.abs(x + dx - S / 2) < S / 2 + pad) && (!dy || Math.abs(y + dy - S / 2) < S / 2 + pad)) fn(x + dx, y + dy); }
function tex(c, metres, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.metres = metres; return t;
}
// Gress: flekkete grunnfarge og tusenvis av korte strå i noen få grønntoner (gruppert, så det tegnes raskt også på mobil).
function grassTexture() {
  const S = 256, c = canvas(S), x = c.getContext('2d'), r = rand(11);
  x.fillStyle = '#566a3a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const px = r() * S, py = r() * S, rad = 6 + r() * 26, col = r() < .5 ? '40,52,26' : '128,132,72';
    wrapped(S, px, py, rad, (cx, cy) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(${col},.35)`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); });
  }
  const tones = ['#3e5229', '#4a5f30', '#566c37', '#62773f', '#6f8247', '#7f8b52', '#959a64'];
  x.lineWidth = 1; x.lineCap = 'round';
  tones.forEach((t, k) => {
    x.strokeStyle = t; x.globalAlpha = .55 + (k % 3) * .15; x.beginPath();
    for (let i = 0; i < 700; i++) {
      const px = r() * S, py = r() * S, l = 2 + r() * 5, a = -Math.PI / 2 + (r() - .5) * 1.6, ex = Math.cos(a) * l, ey = Math.sin(a) * l;
      wrapped(S, px, py, 8, (cx, cy) => { x.moveTo(cx, cy); x.lineTo(cx + ex, cy + ey); });
    }
    x.stroke();
  });
  x.globalAlpha = 1;
  return tex(c, 1.5);
}
// Store, myke flekker som ganges inn i gresset, så plenen ikke ser rutete ut på avstand.
function patchTexture() {
  const S = 64, c = canvas(S), x = c.getContext('2d'), r = rand(5);
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const px = r() * S, py = r() * S, rad = 5 + r() * 14, v = r() < .5 ? 0 : 255;
    wrapped(S, px, py, rad, (cx, cy) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(${v},${v},${v},.22)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); });
  }
  return tex(c, 1, false);
}
// Grus og asfalt: korn i noen få toner.
function grainTexture(base, tones, n, size, metres, seed) {
  const S = 128, c = canvas(S), x = c.getContext('2d'), r = rand(seed);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) { x.fillStyle = tones[i % tones.length]; const s = size * (.5 + r()); x.fillRect(r() * S, r() * S, s, s); }
  return tex(c, metres);
}
// Flate med UV i meter, liggende på bakken, med lengden langs +z.
function flat(w, L, material) {
  const g = new THREE.PlaneGeometry(w, L); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, m = material.map.userData.metres;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / m, uv.getY(i) * L / m);
  const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; return mesh;
}
// Slår sammen geometrier til én (for gran: kjegler oppå hverandre).
function merge(geos) {
  const pos = [], nor = []; for (const g of geos.map(g => g.toNonIndexed())) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
// Ujevn kule til løvkroner og busker. Forskyvningen avhenger bare av retningen, så kantene mellom flatene henger sammen.
// Normalene peker rett ut fra midten, så kronen blir myk og rund i lyset i stedet for kantete.
function lumpy(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); n.setXYZ(i, v.x, v.y, v.z); const k = 1 + .14 * Math.sin(v.x * 4.1 + seed) * Math.sin(v.y * 3.7 + seed * 2) * Math.sin(v.z * 4.3 + seed * 3); p.setXYZ(i, v.x * k, v.y * k, v.z * k); }
  return g;
}
const color = (h, s, l) => new THREE.Color(`hsl(${h}, ${s}%, ${l}%)`);

export function createSurroundings() {
  const group = new THREE.Group(); group.name = 'Omgivelser';
  // Bakken
  const grass = grassTexture(), patches = patchTexture();
  grass.repeat.set(320 / 1.5, 320 / 1.5);
  const groundMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
  groundMat.onBeforeCompile = s => {
    s.uniforms.patches = { value: patches };
    s.fragmentShader = 'uniform sampler2D patches;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= .7 + .6 * texture2D(patches, vMapUv * .09).r;');
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.16; ground.receiveShadow = true; ground.name = 'Plen'; group.add(ground);
  // Sti, vei og trappestein. Ligger så vidt over bakken og trekkes litt mot kameraet, så flatene ikke flimrer mot hverandre.
  const ontop = k => ({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -2 * k });
  const gravelMat = new THREE.MeshStandardMaterial({ map: grainTexture('#a49b8b', ['#8a8174', '#bdb4a3', '#746c61', '#c9c2b4'], 2600, 2.2, .6, 3), ...ontop(2) });
  const roadMat = new THREE.MeshStandardMaterial({ map: grainTexture('#55575a', ['#4a4c4f', '#626467', '#3f4144', '#6c6d6e'], 2200, 1.6, 1, 9), ...ontop(1) });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: .85 });
  const lot = new THREE.Group(); group.add(lot);
  // Trær og busker: få, lette former som gjentas (én tegneoperasjon per form), fargen varierer fra tre til tre.
  const leafMat = new THREE.MeshStandardMaterial({ roughness: .95 }), barkMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(.6, 1, 1, 6).translate(0, .5, 0);
  const crownGeo = lumpy(1), bushGeo = lumpy(4);
  const spruceGeo = merge([[.08, .32, .3], [.26, .3, .25], [.43, .28, .2], [.59, .26, .15], [.74, .26, .1]].map(([y, h, r]) => new THREE.ConeGeometry(r, h, 9).translate(0, y + h / 2, 0)));
  const plants = new THREE.Group(); plants.userData.noAO = true; group.add(plants); // kontaktskyggene regnes bare for huset og bakken
  // Åser i det fjerne: en lav, bølgete ring som disen nesten visker ut.
  const hillMat = new THREE.MeshBasicMaterial({ color: '#58705f', side: THREE.DoubleSide }), hills = new THREE.Mesh(hillGeo(), hillMat);
  hills.userData.noAO = true; hills.name = 'Åser'; group.add(hills);
  let key = null;

  function update(house) {
    const f0 = house.floors[0]; if (!f0) return;
    const b = house.floors.map(bounds).filter(Boolean).reduce((a, c) => a ? { x0: Math.min(a.x0, c.x0), x1: Math.max(a.x1, c.x1), z0: Math.min(a.z0, c.z0), z1: Math.max(a.z1, c.z1) } : c, null) || { x0: -2, x1: 2, z0: -2, z1: 2 };
    const front = frontDoor(house, b);
    const k = JSON.stringify([b, front && [front.x, front.z, front.nx, front.nz, front.width], f0.walls.map(w => w.exterior ? [w.x1, w.z1, w.x2, w.z2, w.openings.map(o => o.type[0] + o.pos)] : 0), house.floors.map(f => f.rooms.map(r => [r.x, r.z, r.w, r.d]))]);
    if (k === key) return; key = k;
    for (const g of [lot, plants]) { g.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o !== g) o.geometry?.dispose(); }); g.clear(); }
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, half = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const r = rand(1 + Math.abs(Math.round(b.x0 * 7 + b.z0 * 13 + (b.x1 - b.x0) * 31 + (b.z1 - b.z0) * 57)) % 9973);
    hills.position.set(cx, 0, cz);
    // Huset: rommene i alle etasjer (eller ytterkanten der en etasje mangler rom), med margin.
    const rects = house.floors.flatMap(f => f.rooms.length ? f.rooms.map(r => [r.x, r.z, r.x + r.w, r.z + r.d]) : [bounds(f)].filter(Boolean).map(q => [q.x0, q.z0, q.x1, q.z1]));
    const inHouse = (x, z, m) => rects.some(([a, c, e, d]) => x > a - m && x < e + m && z > c - m && z < d + m);
    // Veien går på tvers foran ytterdøren (eller foran husets forside når det ikke er noen dør), gangstien rett ut fra døren til veien.
    const D = front || { x: cx, z: b.z1 + .1, nx: 0, nz: 1, width: 0 }, tx = -D.nz, tz = D.nx;
    const reach = Math.max(0, ...[[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => (x - D.x) * D.nx + (z - D.z) * D.nz));
    const roadW = 4.5, toRoad = reach + 7.5, rx = D.x + D.nx * (toRoad + roadW / 2), rz = D.z + D.nz * (toRoad + roadW / 2);
    const road = flat(roadW, 320, roadMat); road.position.set(rx, -.158, rz); road.rotation.y = Math.atan2(tx, tz); road.name = 'Vei'; lot.add(road);
    const offRoad = (x, z, m) => Math.abs((x - rx) * D.nx + (z - rz) * D.nz) > roadW / 2 + m;
    let offPath = () => true;
    if (front) {
      const L = toRoad + .3, path = flat(1.1, L, gravelMat);
      path.position.set(D.x + D.nx * L / 2, -.156, D.z + D.nz * L / 2); path.rotation.y = Math.atan2(D.nx, D.nz); path.name = 'Gangsti'; lot.add(path);
      const sw = Math.max(1.2, D.width + .6), step = new THREE.Mesh(new THREE.BoxGeometry(sw, .15, .9), stoneMat);
      step.position.set(D.x + D.nx * .45, -.085, D.z + D.nz * .45); step.rotation.y = path.rotation.y; step.castShadow = step.receiveShadow = true; step.name = 'Trappestein'; lot.add(step);
      offPath = (x, z, m) => { const a = (x - D.x) * D.nx + (z - D.z) * D.nz, s = Math.abs((x - D.x) * tx + (z - D.z) * tz); return a < -m || a > L + m || s > .55 + m; };
    }
    // Kameraet ser huset fra denne kanten først. Høye trær holdes unna der, så de ikke står i veien for oversikten.
    const view = new THREE.Vector2(.45, .8).normalize();
    const inView = (x, z) => { const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz); return L < half + 26 && (dx * view.x + dz * view.y) / L > .7; };
    const trees = [], far = [];
    const clear = (x, z, list, gap) => list.every(t => Math.hypot(t.x - x, t.z - z) > gap);
    for (let i = 0; i < 80 && trees.length < 7; i++) {
      const a = r() * Math.PI * 2, d = half + 5 + r() * 11, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (inHouse(x, z, 4) || !offPath(x, z, 2.5) || !offRoad(x, z, 3) || inView(x, z) || !clear(x, z, trees, 4.5)) continue;
      trees.push({ x, z, spruce: r() < .4, h: 5 + r() * 4.5, w: .85 + r() * .3, rot: r() * 6.3, c: r() });
    }
    // Skogkanten: tettere i noen retninger, glissen i andre, så horisonten synes mellom trærne.
    for (let i = 0; i < 260 && far.length < 110; i++) {
      const a = r() * Math.PI * 2, d = 34 + r() * 46, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.sin(a * 3 + 1.3) * Math.sin(a * 5 + .4) + .35 < r() * .9 || !offRoad(x, z, 4) || !clear(x, z, far, 3.2)) continue;
      far.push({ x, z, spruce: r() < .7, h: 9 + r() * 8, w: .8 + r() * .35, rot: r() * 6.3, c: r() });
    }
    // Busker langs ytterveggene, men ikke foran dører og ikke på stien.
    const bushes = [];
    for (const w of f0.walls) {
      if (!w.exterior) continue;
      const L = wallLength(w), ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, n = outward(f0, w, L / 2, b);
      for (let j = 0; j < (L > 6 ? 3 : L > 3 ? 2 : 1) && bushes.length < 10; j++) {
        const s = .6 + r() * Math.max(0, L - 1.2), off = w.thickness / 2 + .45 + r() * .3, x = w.x1 + ux * s + n[0] * off, z = w.z1 + uz * s + n[1] * off;
        if (r() < .35 || w.openings.some(o => o.type === 'door' && Math.abs(o.pos - s) < o.width / 2 + .8) || inHouse(x, z, .25) || !offPath(x, z, .9) || !clear(x, z, bushes, 1.4)) continue;
        bushes.push({ x, z, s: .35 + r() * .25, rot: r() * 6.3, c: r() });
      }
    }
    plant(trees, true); plant(far, false);
    instanced(bushGeo, leafMat, bushes, (t, m) => m.compose(v3(t.x, -.16 + t.s * .7, t.z), yrot(t.rot), v3(t.s * 1.2, t.s, t.s * 1.2)), t => color(100 + t.c * 25, 30 + t.c * 12, 20 + t.c * 8), true);
  }
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), yrot = a => q.setFromAxisAngle(up, a);
  function instanced(geo, material, list, place, paint, shadow) {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length), m = new THREE.Matrix4();
    list.forEach((t, i) => { mesh.setMatrixAt(i, place(t, m)); mesh.setColorAt(i, paint(t)); });
    mesh.castShadow = shadow; mesh.receiveShadow = shadow; mesh.computeBoundingSphere(); plants.add(mesh);
  }
  // Løvtre: stamme (bjørk eller mørk bark) og ujevn krone. Gran: fem kjegler og en kort stamme.
  function plant(list, shadow) {
    const leafy = list.filter(t => !t.spruce), spruce = list.filter(t => t.spruce), base = -.16;
    instanced(trunkGeo, barkMat, list, (t, m) => { const s = t.h * (t.spruce ? .03 : .028); return m.compose(v3(t.x, base, t.z), yrot(t.rot), v3(s, t.h * (t.spruce ? .2 : .55), s)); },
      t => t.spruce ? color(25, 25, 22) : t.c < .5 ? color(40, 10, 82) : color(28, 22, 28), shadow);
    instanced(crownGeo, leafMat, leafy, (t, m) => { const s = t.h * .27 * t.w; return m.compose(v3(t.x, base + t.h * .64, t.z), yrot(t.rot), v3(s, s * 1.2, s)); },
      t => color(92 + t.c * 30, 32 + t.c * 14, 24 + t.c * 10), shadow);
    instanced(spruceGeo, leafMat, spruce, (t, m) => m.compose(v3(t.x, base, t.z), yrot(t.rot), v3(t.h * t.w, t.h, t.h * t.w)),
      t => color(130 + t.c * 25, 22 + t.c * 12, 16 + t.c * 7), shadow);
  }
  function setMood(mood) { groundMat.color.set(mood.grass); hillMat.color.set(mood.hills); }
  return { group, update, setMood };
}

// Retningen ut av huset fra et punkt på veggen: siden som ikke ligger i et rom (eller bort fra midten når etasjen mangler rom).
function outward(f, w, s, b) {
  const L = wallLength(w) || 1, ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, x = w.x1 + ux * s, z = w.z1 + uz * s;
  const room = (px, pz) => f.rooms.some(r => px > r.x && px < r.x + r.w && pz > r.z && pz < r.z + r.d);
  let n = [uz, -ux];
  const a = room(x + n[0] * .4, z + n[1] * .4), c = room(x - n[0] * .4, z - n[1] * .4);
  if (a !== c ? a : (x - (b.x0 + b.x1) / 2) * n[0] + (z - (b.z0 + b.z1) / 2) * n[1] < 0) n = [-n[0], -n[1]];
  return n;
}
// Ytterdøren: en dør i en yttervegg i nederste etasje. Er det flere, vinner den som går inn til gang, entré eller vindfang.
function frontDoor(house, b) {
  const f = house.floors[0]; let best = null;
  for (const w of f.walls) for (const o of w.openings || []) {
    if (o.type !== 'door' || !w.exterior) continue;
    const L = wallLength(w), ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, n = outward(f, w, o.pos, b), t = w.thickness / 2;
    const x = w.x1 + ux * o.pos, z = w.z1 + uz * o.pos, room = f.rooms.find(r => { const px = x - n[0] * .4, pz = z - n[1] * .4; return px > r.x && px < r.x + r.w && pz > r.z && pz < r.z + r.d; });
    const score = (/gang|entr|hall|vindfang|inngang/i.test(room?.name || '') ? 2 : 0) + o.width;
    if (!best || score > best.score) best = { score, x: x + n[0] * t, z: z + n[1] * t, nx: n[0], nz: n[1], width: o.width };
  }
  return best;
}
function hillGeo() {
  const N = 96, R = 95, pos = [];
  const h = a => 5 + 4 * Math.sin(a * 3 + .5) + 3 * Math.sin(a * 7 + 2.1) + 1.5 * Math.sin(a * 13 + .3);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2, P = (a, y) => [Math.cos(a) * R, y, Math.sin(a) * R];
    pos.push(...P(a, -.2), ...P(b, -.2), ...P(b, h(b)), ...P(a, -.2), ...P(b, h(b)), ...P(a, h(a)));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
