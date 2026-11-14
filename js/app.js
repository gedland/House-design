import { DEMO, MATERIALS, FURNITURE, OPENINGS, ROOFS, find, round, uid, normalize, bounds, wallLength, wallAngle, setWall, reshapeRoom, blocked } from './house.js';
import { createView } from './scene.js';

const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c.flat().filter(x => x != null && x !== false)); return e; };
const btn = (textContent, onclick, p = {}) => h('button', { type: 'button', textContent, onclick, ...p });
const clone = o => JSON.parse(JSON.stringify(o));
const snap = v => Math.round(v * 20) / 20;
// sel = valgt objekt, floor = etasjen som vises (null = hele huset), sheet = åpent ark, placing = dør/vindu som venter på et trykk på en vegg
const S = { house: clone(DEMO), sel: null, undo: [], pending: null, move: false, floor: null, walk: null, sheet: null, placing: null, photos: [], ai: false, busy: false, note: '', report: null };
let view;
try { view = createView($('#view')); }
catch (e) { window.husformFail?.(`Nettleseren fikk ikke startet 3D-grafikk (WebGL): ${e.message}`); throw e; }

// Lagring i IndexedDB
const DB = new Promise((ok, no) => { const r = indexedDB.open('husform', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const db = (mode, fn) => DB.then(d => new Promise((ok, no) => { const q = fn(d.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); })).catch(() => null);
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => db('readwrite', s => s.put(S.house, 'house')), 300); };

// Alle endringer går gjennom edit(): JSON endres, 3D tegnes på nytt. commit() lagrer og legger et angre-steg.
let drawT = 0;
const shown = () => S.walk ? null : S.floor;
function draw() { if (drawT) return; drawT = requestAnimationFrame(() => { drawT = 0; view.build(S.house, { floor: shown() }); view.select(S.sel); }); }
function edit(fn, done = true) { S.pending ??= JSON.stringify(S.house); fn(); draw(); if (done) commit(); }
function commit() {
  if (S.pending && S.pending !== JSON.stringify(S.house)) { S.undo.push(S.pending); if (S.undo.length > 50) S.undo.shift(); save(); }
  S.pending = null; $('#undo').disabled = !S.undo.length;
}
// Bytter ut hele huset. Det gamle huset blir et angre-steg.
function replace(house) {
  S.undo.push(JSON.stringify(S.house)); S.house = house; S.sel = null; S.move = false; S.floor = null; S.sheet = null; S.pending = null;
  $('#undo').disabled = false; if (S.walk) leave(); view.build(S.house, { floor: null }); view.frame(); ui(); save();
}
function select(id) {
  if (id !== S.sel) S.move = false;
  S.sel = id && find(S.house, id) ? id : null; if (S.sel) { S.sheet = null; localStorage.tipSeen = 1; }
  draw(); ui();
}
const say = (note = '') => { S.note = note; ui(); };

// Panelet: feltene for det valgte objektet
const num = (key, label, min = 0, step = .05) => ({ key, label, type: 'number', min, step });
const opts = o => Object.entries(o).map(([v, x]) => [v, x.label || x]);
const colorF = (label = 'Farge') => ({ key: 'color', label, type: 'color' }), matF = (label = 'Materiale') => ({ key: 'material', label, type: 'select', options: opts(MATERIALS) });
const FIELDS = {
  room: [{ key: 'name', label: 'Navn', type: 'text', wide: true }, num('w', 'Bredde (m)', .5), num('d', 'Dybde (m)', .5), num('height', 'Takhøyde (m)', 1.8), matF('Gulv'), colorF('Gulvfarge'), num('x', 'Plassering X (m)', -500), num('z', 'Plassering Z (m)', -500)],
  wall: [colorF(), matF(), num('length', 'Lengde (m)', .2), num('angle', 'Retning (°)', -360, 15), num('thickness', 'Tykkelse (m)', .05, .01)],
  opening: [{ key: 'type', label: 'Type', type: 'select', options: opts(OPENINGS) }, colorF(), num('width', 'Bredde (m)', .3), num('height', 'Høyde (m)', .3), num('sill', 'Høyde over gulv (m)'), num('pos', 'Avstand langs vegg (m)')],
  furniture: [{ key: 'type', label: 'Type', type: 'select', options: opts(FURNITURE) }, colorF(), matF(), num('w', 'Bredde (m)', .1), num('d', 'Dybde (m)', .1), num('h', 'Høyde (m)', .1), num('rot', 'Rotasjon (°)', -360, 15), num('x', 'Plassering X (m)', -500), num('z', 'Plassering Z (m)', -500)],
  roof: [{ key: 'type', label: 'Takform', type: 'select', options: opts(ROOFS) }, colorF(), matF(), num('pitch', 'Takvinkel (°)', 5, 1), num('overhang', 'Takutstikk (m)')],
};
const KIND = { room: 'Rom', wall: 'Vegg', opening: 'Åpning', furniture: 'Møbel', roof: 'Tak' };
const title = f => f.kind === 'room' ? f.item.name || 'Rom' : f.kind === 'wall' ? 'Vegg' : f.kind === 'roof' ? ROOFS[f.item.type] : f.kind === 'opening' ? OPENINGS[f.item.type].label : FURNITURE[f.item.type]?.label || 'Møbel';
function getValue(f, key) {
  if (f.kind === 'wall' && key === 'length') return round(wallLength(f.item));
  if (f.kind === 'wall' && key === 'angle') return wallAngle(f.item);
  if (f.kind === 'room' && key === 'height') return f.floor.height;
  return f.item[key];
}
function setValue(f, key, v) {
  if (f.kind === 'wall' && key === 'length') setWall(f.item, v, wallAngle(f.item));
  else if (f.kind === 'wall' && key === 'angle') setWall(f.item, wallLength(f.item), v);
  else if (f.kind === 'room' && key === 'height') f.floor.height = v;
  else if (f.kind === 'room' && 'xzwd'.includes(key)) reshapeRoom(f.floor, f.item, { [key]: v });
  else f.item[key] = v;
}
const head = (small, big, close) => h('div', { className: 'head' }, h('div', {}, small && h('small', { textContent: small }), h('h2', { textContent: big })), btn('✕', close, { className: 'icon', ariaLabel: 'Lukk' }));
function selectionPanel(f) {
  const fields = FIELDS[f.kind].map(d => {
    const v = getValue(f, d.key);
    const input = d.type === 'select'
      ? h('select', {}, d.options.map(([value, label]) => h('option', { value, textContent: label, selected: value === v })))
      : h('input', { type: d.type, value: v ?? '', ...(d.type === 'number' ? { min: d.min, step: d.step, inputMode: 'decimal' } : {}) });
    input.oninput = () => {
      let val = input.value;
      if (d.type === 'number') { val = parseFloat(val); if (!isFinite(val) || val < d.min) return; }
      edit(() => setValue(find(S.house, S.sel), d.key, val), false);
      if (d.key === 'name' || d.key === 'type') $('#panel h2').textContent = title(find(S.house, S.sel));
    };
    input.onchange = commit;
    return h('label', { className: d.wide ? 'wide' : '' }, h('span', { textContent: d.label }), input);
  });
  return [head(KIND[f.kind], title(f), () => select(null)),
    h('div', { className: 'acts' },
      f.kind !== 'roof' && btn(S.move ? 'Ferdig flyttet' : 'Flytt', () => { S.move = !S.move; ui(); }, { ariaPressed: String(S.move) }),
      btn('Slett', remove, { className: 'danger' })),
    S.move && h('p', { className: 'hint', textContent: 'Dra i 3D-visningen for å flytte objektet.' }),
    h('div', { className: 'fields' }, fields)];
}
function remove() {
  const f = find(S.house, S.sel); if (!f) return;
  edit(() => { if (f.kind === 'roof') S.house.roof = null; else f.list.splice(f.list.indexOf(f.item), 1); }); select(null);
}

// Legg til nye objekter. De havner midt i bildet, på etasjen som vises.
const floorIndex = () => S.walk ? S.walk.floor : S.floor ?? 0;
function spot() {
  const c = S.walk ? view.camera.position : view.controls.target, b = bounds(S.house.floors[floorIndex()]) || { x0: -50, x1: 50, z0: -50, z1: 50 };
  return { x: snap(Math.min(b.x1, Math.max(b.x0, c.x))), z: snap(Math.min(b.z1, Math.max(b.z0, c.z))) };
}
function add(key, item, move = true) {
  item.id = uid(key[0] === 'f' ? 'm' : key[0]);
  edit(() => S.house.floors[floorIndex()][key].push(item)); select(item.id); S.move = move; ui();
}
const wallAt = (x1, z1, x2, z2, like) => ({ id: uid('w'), x1, z1, x2, z2, thickness: like?.thickness ?? .2, material: like?.material ?? 'panel', color: like?.color ?? '#e9e4d8', openings: [] });
function addFurniture(type) { const { label, ...d } = FURNITURE[type]; add('furniture', { type, ...spot(), rot: 0, ...d }); }
function addWall() { const p = spot(); add('walls', wallAt(p.x - 1.5, p.z, p.x + 1.5, p.z, { thickness: .1, material: 'maling', color: '#f1eee7' })); }
function addRoom() {
  const f = S.house.floors[floorIndex()], b = bounds(f), x = b ? b.x1 : 0, z = b ? b.z0 : 0, like = f.walls[0];
  const room = { id: uid('r'), name: 'Nytt rom', x, z, w: 3, d: 3, material: 'tre', color: '#c8a57a' };
  edit(() => { f.rooms.push(room); f.walls.push(wallAt(x, z, x + 3, z, like), wallAt(x + 3, z, x + 3, z + 3, like), wallAt(x + 3, z + 3, x, z + 3, like), ...(b ? [] : [wallAt(x, z + 3, x, z, like)])); });
  select(room.id);
}
function addFloor() {
  const below = S.house.floors.at(-1), b = bounds(below) || { x0: 0, x1: 6, z0: 0, z1: 5 }, like = below.walls[0];
  const f = { id: uid('f'), name: `${S.house.floors.length + 1}. etasje`, height: 2.4, furniture: [],
    rooms: [{ id: uid('r'), name: 'Rom', x: b.x0, z: b.z0, w: round(b.x1 - b.x0), d: round(b.z1 - b.z0), material: 'tre', color: '#c8a57a' }],
    walls: [wallAt(b.x0, b.z1, b.x1, b.z1, like), wallAt(b.x1, b.z1, b.x1, b.z0, like), wallAt(b.x1, b.z0, b.x0, b.z0, like), wallAt(b.x0, b.z0, b.x0, b.z1, like)] };
  edit(() => S.house.floors.push(f)); S.floor = S.house.floors.length - 1; S.sheet = null; draw(); ui();
}
function removeFloor() {
  if (S.house.floors.length < 2 || !confirm(`Slette ${S.house.floors[floorIndex()].name} med alt innhold?`)) return;
  edit(() => S.house.floors.splice(floorIndex(), 1)); S.floor = null; S.sel = null; S.sheet = null; draw(); ui();
}
function addRoof() { edit(() => { S.house.roof = clone(DEMO.roof); }); S.floor = null; select('roof'); }
function place(type) { S.placing = type; S.sheet = null; S.sel = null; draw(); ui(); }
function placeOn(hit) {
  const f = hit && find(S.house, hit.id), wall = f?.kind === 'wall' ? f.item : f?.kind === 'opening' ? f.wall : null;
  if (!wall) return say('Det var ikke en vegg. Trykk på veggen der den skal stå.');
  const { label, ...d } = OPENINGS[S.placing], L = wallLength(wall), half = Math.min(d.width, L - .2) / 2;
  const t = ((hit.point.x - wall.x1) * (wall.x2 - wall.x1) + (hit.point.z - wall.z1) * (wall.z2 - wall.z1)) / L;
  const o = { id: uid('o'), type: S.placing, pos: snap(Math.min(L - half, Math.max(half, t))), ...d, width: half * 2 };
  S.placing = null; S.note = ''; edit(() => wall.openings.push(o)); select(o.id);
}
function addSheet() {
  const tile = (label, fn) => btn(label, fn, { className: 'tile' });
  return [head(S.house.floors[floorIndex()].name, 'Legg til', () => sheet(null)),
    h('h3', { textContent: 'Bygg' }),
    h('div', { className: 'tiles' }, tile('Vegg', addWall), tile('Dør', () => place('door')), tile('Vindu', () => place('window')), tile('Rom', addRoom), tile('Etasje', addFloor), !S.house.roof && tile('Tak', addRoof)),
    h('h3', { textContent: 'Møbler' }),
    h('div', { className: 'tiles' }, Object.entries(FURNITURE).map(([type, f]) => tile(f.label, () => addFurniture(type))))];
}

// Bilder inn → 3D-modell. Bildene krympes i nettleseren og sendes til serveren, som spør Claude.
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return c.toDataURL('image/jpeg', .8);
}
async function addPhotos(files) {
  for (const f of files) { if (S.photos.length >= 30) break; try { S.photos.push(await shrink(f)); } catch { S.note = 'Noen av filene kunne ikke leses som bilder.'; } }
  ui();
}
async function analyze() {
  S.busy = true; say('Claude leser bildene og bygger modellen. Det kan ta et par minutter.');
  try {
    const r = await fetch('api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: S.photos }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Serveren svarte med feil ${r.status}.`);
    S.busy = false; S.note = ''; S.photos = []; replace(normalize(j.house));
    // Serveren har kontrollert modellen før den tegnes. Alt den rettet eller ikke fikk rettet, vises her.
    const rep = j.report; if (rep?.fixed?.length || rep?.problems?.length) { S.report = rep; S.sheet = 'report'; ui(); }
  } catch (e) { S.busy = false; say(e instanceof TypeError ? 'Fikk ikke kontakt med serveren.' : e.message); }
}
function photoSheet() {
  const n = S.photos.length, file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => addPhotos([...e.target.files]) });
  return [head('Nytt hus', 'Fra bilder til 3D', () => sheet(null)),
    h('p', { className: 'hint', textContent: S.ai ? 'Velg 5–30 bilder av ett hus, både ute og inne. Jo flere rom og vinkler, jo bedre modell. Målene blir anslag som du kan rette etterpå.'
      : 'Serveren har ingen API-nøkkel, så bildene kan ikke tolkes her. Du kan åpne demohuset i stedet. Sett ANTHROPIC_API_KEY i .env og start node server.js for å bruke egne bilder.' }),
    S.ai && h('div', { className: 'photos' }, S.photos.map((src, i) => h('button', { type: 'button', ariaLabel: `Fjern bilde ${i + 1}`, disabled: S.busy, onclick: () => { S.photos.splice(i, 1); ui(); } }, h('img', { src, alt: '' }))),
      n < 30 && h('label', { className: 'pick' }, file, '+ Bilder')),
    S.ai ? btn(S.busy ? 'Arbeider …' : n < 5 ? `Velg minst 5 bilder (${n} valgt)` : `Lag 3D-modell av ${n} bilder`, analyze, { className: 'primary', disabled: S.busy || n < 5 })
      : btn('Åpne demohuset', () => replace(clone(DEMO)), { className: 'primary' })];
}

function reportSheet() {
  const { fixed = [], problems = [] } = S.report || {}, items = a => h('ul', { className: 'report' }, a.map(t => h('li', { textContent: t })));
  return [head('Fra bilder til 3D', 'Kontroll av modellen', () => sheet(null)),
    h('p', { className: 'hint', textContent: 'Modellen ble kontrollert før den ble tegnet. Målene er anslag, så se over huset og rett det som ikke stemmer.' }),
    problems.length > 0 && h('h3', { textContent: 'Må ses over' }), problems.length > 0 && items(problems),
    fixed.length > 0 && h('h3', { textContent: 'Rettet automatisk' }), fixed.length > 0 && items(fixed)];
}

// Eksport og import
const fileName = ext => `${S.house.name.replace(/[^\wæøå]+/gi, '-').replace(/^-|-$/g, '') || 'hus'}.${ext}`;
function download(blob, name) { const a = h('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
async function exportGLB() {
  say('Lager GLB …');
  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    cancelAnimationFrame(drawT); drawT = 0; view.build(S.house, { floor: null });
    const buf = await new GLTFExporter().parseAsync(view.root, { binary: true });
    download(new Blob([buf], { type: 'model/gltf-binary' }), fileName('glb')); say('');
  } catch { say('GLB-eksporten feilet.'); }
  draw();
}
async function importJSON(file) {
  try { replace(normalize(JSON.parse(await file.text()))); } catch (e) { say(`Filen kunne ikke leses som et hus. ${e instanceof SyntaxError ? 'Den er ikke gyldig JSON.' : e.message}`); }
}
function moreSheet() {
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: e => e.target.files[0] && importJSON(e.target.files[0]) });
  const name = h('input', { type: 'text', value: S.house.name, maxLength: 60, oninput: () => edit(() => { S.house.name = name.value; }, false), onchange: commit });
  return [head(null, 'Mer', () => sheet(null)),
    h('div', { className: 'fields' }, h('label', { className: 'wide' }, h('span', { textContent: 'Navn på huset' }), name)),
    h('div', { className: 'list' },
      btn('Eksporter JSON', () => download(new Blob([JSON.stringify(S.house, null, 2)], { type: 'application/json' }), fileName('json'))),
      btn('Eksporter GLB (3D-fil)', exportGLB),
      h('label', { className: 'row' }, file, 'Importer JSON'),
      S.floor !== null && S.house.floors.length > 1 && btn(`Slett ${S.house.floors[S.floor].name}`, removeFloor, { className: 'danger' }),
      btn('Åpne demohuset', () => { if (confirm('Bytte ut huset med demohuset? Du kan angre etterpå.')) replace(clone(DEMO)); }))];
}
function sheet(name) { S.sheet = name; S.sel = null; S.move = false; S.placing = null; S.note = ''; draw(); ui(); }

// Interiørmodus
function enter() {
  const i = S.floor ?? 0, f = S.house.floors[i], r = [...f.rooms].sort((a, b) => b.w * b.d - a.w * a.d)[0], b = bounds(f);
  const x = r ? r.x + r.w / 2 : b ? (b.x0 + b.x1) / 2 : 0, z = r ? r.z + r.d / 2 : b ? (b.z0 + b.z1) / 2 : 0;
  S.walk = { floor: i }; S.sheet = null; S.placing = null;
  view.build(S.house, { floor: null }); view.setWalk({ x, z, y: eye(i), yaw: 0, hit: (px, pz) => S.walk && blocked(S.house.floors[S.walk.floor], px, pz) }); select(null);
}
const eye = i => S.house.floors.slice(0, i).reduce((s, f) => s + f.height, 0) + Math.min(1.6, S.house.floors[i].height - .3);
function leave() { S.walk = null; stick(0, 0); view.setWalk(null); draw(); ui(); }
function climb(d) {
  const i = S.walk.floor + d; if (!S.house.floors[i]) return;
  S.walk.floor = i; const p = view.camera.position; view.setWalk({ x: p.x, z: p.z, y: eye(i) }); ui();
}
const keys = new Set();
function stick(x, z) { const m = Math.hypot(x, z); view.go(m > 1 ? x / m : x, m > 1 ? z / m : z); $('#knob').style.translate = `${x * 34}px ${-z * 34}px`; }
const pad = $('#stick');
const steer = e => { const r = pad.getBoundingClientRect(), k = v => Math.max(-1, Math.min(1, v)); stick(k((e.clientX - r.left - r.width / 2) / 40), k(-(e.clientY - r.top - r.height / 2) / 40)); };
pad.onpointerdown = e => { pad.setPointerCapture(e.pointerId); steer(e); };
pad.onpointermove = e => pad.hasPointerCapture(e.pointerId) && steer(e);
pad.onpointerup = pad.onpointercancel = () => stick(0, 0);
function keyMove() { const k = (...c) => c.some(x => keys.has(x)) ? 1 : 0; stick(k('d', 'arrowright') - k('a', 'arrowleft'), k('w', 'arrowup') - k('s', 'arrowdown')); }

// Tegner hele grensesnittet ut fra tilstanden
function ui() {
  const el = $('#panel'), f = S.sel && find(S.house, S.sel);
  const content = f ? selectionPanel(f) : S.sheet === 'add' ? addSheet() : S.sheet === 'photos' ? photoSheet() : S.sheet === 'more' ? moreSheet() : S.sheet === 'report' && S.report ? reportSheet() : null;
  const banner = S.placing ? `Trykk på veggen der ${S.placing === 'door' ? 'døren' : 'vinduet'} skal stå.` : !content && S.note;
  document.body.className = [content && 'has-panel', f && S.move && 'moving', S.walk && 'walk', (S.placing || banner) && 'has-banner', localStorage.tipSeen && 'seen'].filter(Boolean).join(' ');
  el.replaceChildren(...(content || []).filter(Boolean), ...(content && S.note ? [h('p', { className: 'note', role: 'status', textContent: S.note })] : []));
  $('#banner').replaceChildren(...(banner ? [h('span', { textContent: S.placing ? (S.note || banner) : banner }), btn(S.placing ? 'Avbryt' : 'OK', () => { S.placing = null; say(''); })] : []));
  const fl = S.house.floors, chip = (label, on, fn) => btn(label, fn, { ariaPressed: String(on) });
  $('#floors').replaceChildren(...(S.walk
    ? [btn('Ut av huset', leave, { className: 'out' }), fl.length > 1 && btn('Opp', () => climb(1), { disabled: !fl[S.walk.floor + 1] }), fl.length > 1 && btn('Ned', () => climb(-1), { disabled: !S.walk.floor })]
    : [chip('Hele huset', S.floor === null, () => showFloor(null)), ...fl.map((x, i) => chip(x.name, S.floor === i, () => showFloor(i)))]).filter(Boolean));
  const wide = matchMedia('(min-width: 760px)').matches;
  view.setInset(content && wide ? el.offsetWidth + 10 : 0, content && !wide ? el.offsetHeight : 0);
}
function showFloor(i) { S.floor = i; const f = S.sel && find(S.house, S.sel); if (f && (f.kind === 'roof' ? i !== null : i !== null && f.index > i)) S.sel = null; draw(); ui(); }

// Pek og dra: trykk velger et objekt. Med «Flytt» på flytter dra det valgte objektet, ellers styrer dra kameraet.
const cv = $('#view'); let down = null;
cv.addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  down = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, id: e.pointerId, far: false };
  const f = S.move && S.sel && find(S.house, S.sel), p = f && view.planePoint(e, f.y);
  if (p) { down.drag = { y: f.y, x: p.x, z: p.z, ax: 0, az: 0 }; view.controls.enabled = false; }
  if (p || S.walk) cv.setPointerCapture(e.pointerId);
}, true);
cv.addEventListener('pointermove', e => {
  if (!down || e.pointerId !== down.id) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.far = true;
  const g = down.drag;
  if (!g) { if (S.walk) view.look(e.clientX - down.px, e.clientY - down.py); down.px = e.clientX; down.py = e.clientY; return; }
  const p = view.planePoint(e, g.y), f = find(S.house, S.sel); if (!p || !f) return;
  const tx = snap(p.x - g.x), tz = snap(p.z - g.z), dx = tx - g.ax, dz = tz - g.az, it = f.item;
  if (!dx && !dz) return;
  g.ax = tx; g.az = tz;
  edit(() => {
    if (f.kind === 'furniture') { it.x = round(it.x + dx); it.z = round(it.z + dz); }
    else if (f.kind === 'room') reshapeRoom(f.floor, it, { x: it.x + dx, z: it.z + dz });
    else if (f.kind === 'wall') { it.x1 = round(it.x1 + dx); it.x2 = round(it.x2 + dx); it.z1 = round(it.z1 + dz); it.z2 = round(it.z2 + dz); }
    else if (f.kind === 'opening') { const w = f.wall, L = wallLength(w) || 1; it.pos = round(Math.min(L, Math.max(0, it.pos + (dx * (w.x2 - w.x1) + dz * (w.z2 - w.z1)) / L))); }
  }, false);
  ui();
});
const up = e => {
  if (!down || e.pointerId !== down.id) return;
  const d = down; down = null;
  if (d.drag) { view.controls.enabled = !S.walk; commit(); }
  else if (e.type === 'pointerup' && !d.far) { const hit = view.pick(e); if (S.placing) placeOn(hit); else if (S.sheet && !hit) sheet(null); else select(hit?.id); }
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

$('#undo').onclick = () => {
  const s = S.undo.pop(); if (!s) return;
  S.house = JSON.parse(s); S.pending = null; $('#undo').disabled = !S.undo.length;
  if (S.walk && !S.house.floors[S.walk.floor]) leave();
  if (S.floor !== null && !S.house.floors[S.floor]) S.floor = null;
  select(S.sel); save();
};
$('#b-photos').onclick = () => sheet('photos'); $('#b-add').onclick = () => sheet('add'); $('#b-more').onclick = () => sheet('more'); $('#b-walk').onclick = enter;
addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (S.walk && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); keys.add(k); return keyMove(); }
  if (k === 'escape') { if (S.sel || S.sheet || S.placing) { S.placing = null; S.sheet = null; S.note = ''; select(null); } else if (S.walk) leave(); }
  if ((k === 'delete' || k === 'backspace') && S.sel) remove();
  if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#undo').click(); }
});
addEventListener('keyup', e => { if (keys.delete(e.key.toLowerCase())) keyMove(); });
addEventListener('blur', () => { keys.clear(); if (S.walk) stick(0, 0); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'; view.theme(); });
matchMedia('(min-width: 760px)').addEventListener('change', ui);

fetch('api/status').then(r => r.json()).then(j => { S.ai = !!j.ai; if (S.sheet === 'photos') ui(); }).catch(() => {});
db('readonly', s => s.get('house')).then(saved => {
  try { if (saved?.version === 1) S.house = normalize(saved); } catch {}
  view.build(S.house, { floor: null }); view.frame(); ui(); window.husformReady = true;
});
