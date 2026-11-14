import { DEMO, MATERIALS, FURNITURE, OPENINGS, ROOFS, find, round, uid, normalize, bounds, wallLength, wallAngle, reshapeRoom, moveWall, resizeWall, fitOpenings, tidy } from './house.js';
import { createView } from './scene.js';

const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c.flat().filter(x => x != null && x !== false)); return e; };
const btn = (textContent, onclick, p = {}) => h('button', { type: 'button', textContent, onclick, ...p });
const clone = o => JSON.parse(JSON.stringify(o));
const snap = v => Math.round(v * 20) / 20;
// sel = valgt objekt, floor = etasjen som vises (null = hele huset), sheet = åpent ark, placing = dør/vindu som venter på et trykk på en vegg
const S = { house: clone(DEMO), sel: null, undo: [], pending: null, move: false, floor: null, walk: null, sheet: null, placing: null, photos: [], prep: null, job: null, server: null, report: null, note: '' };
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
  room: [{ key: 'name', label: 'Navn', type: 'text', wide: true }, num('w', 'Bredde (m)', .5), num('d', 'Dybde (m)', .5), num('height', 'Takhøyde (m)', 1), matF('Gulv'), colorF('Gulvfarge'), num('x', 'Plassering X (m)', -500), num('z', 'Plassering Z (m)', -500)],
  wall: [colorF(), matF(), num('length', 'Lengde (m)', .2), num('angle', 'Retning (°)', -360, 15), num('thickness', 'Tykkelse (m)', .05, .01), { key: 'exterior', label: 'Yttervegg (taket følger ytterveggene)', type: 'checkbox', wide: true }],
  opening: [{ key: 'type', label: 'Type', type: 'select', options: opts(OPENINGS) }, colorF(), matF(), num('width', 'Bredde (m)', .3), num('height', 'Høyde (m)', .3), num('sill', 'Høyde over gulv (m)'), num('pos', 'Avstand langs vegg (m)')],
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
// Endrer ett felt. Naboer følger med der det trengs: vegger som møter en vegg som endres, og dører og vinduer i den.
function setValue(f, key, v) {
  if (f.kind === 'wall' && key === 'length') resizeWall(f.floor, f.item, v, wallAngle(f.item));
  else if (f.kind === 'wall' && key === 'angle') resizeWall(f.floor, f.item, wallLength(f.item), v);
  else if (f.kind === 'opening' && key === 'type') { // dør står på gulvet; vindu får vanlig brystning
    const d = OPENINGS[v]; Object.assign(f.item, { type: v, sill: d.sill, height: Math.min(d.height, f.floor.height - .05 - d.sill), material: d.material });
  }
  else if (f.kind === 'opening' && (key === 'width' || key === 'pos')) { f.item[key] = v; fitOpenings(f.wall); }
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
      : d.type === 'checkbox' ? h('input', { type: 'checkbox', checked: !!v })
      : h('input', { type: d.type, value: v ?? '', ...(d.type === 'number' ? { min: d.min, step: d.step, inputMode: 'decimal' } : {}) });
    if (d.type === 'checkbox') {
      input.onchange = () => { edit(() => setValue(find(S.house, S.sel), d.key, input.checked)); };
      return h('label', { className: 'check wide' }, input, h('span', { textContent: d.label }));
    }
    input.oninput = () => {
      let val = input.value;
      if (d.type === 'number') { val = parseFloat(val); if (!isFinite(val) || val < d.min) return; }
      edit(() => setValue(find(S.house, S.sel), d.key, val), false);
      if (d.key === 'name' || d.key === 'type') $('#panel h2').textContent = title(find(S.house, S.sel));
    };
    input.onchange = () => { commit(); if (d.key === 'type' || d.key === 'width' || d.key === 'pos') ui(); };
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
const wallAt = (x1, z1, x2, z2, like) => ({ id: uid('w'), x1, z1, x2, z2, thickness: like?.thickness ?? .2, exterior: like?.exterior ?? false, material: like?.material ?? 'panel', color: like?.color ?? '#e9e4d8', openings: [] });
function addFurniture(type) { const { label, ...d } = FURNITURE[type]; add('furniture', { type, ...spot(), rot: 0, ...d }); }
function addWall() { const p = spot(); add('walls', wallAt(p.x - 1.5, p.z, p.x + 1.5, p.z, { thickness: .1, material: 'maling', color: '#f1eee7' })); }
// Nytt rom på 3 × 3 m inntil husets høyre side. Ytterveggene ryddes etterpå, så rommet blir en del av husets ytre form
// (veggen mellom huset og rommet blir innervegg) og taket følger med.
function addRoom() {
  const f = S.house.floors[floorIndex()], b = bounds(f), x = b ? b.x1 : 0, z = b ? b.z0 : 0, like = f.walls.find(w => w.exterior) || f.walls[0];
  const room = { id: uid('r'), name: 'Nytt rom', x, z, w: 3, d: 3, material: 'tre', color: '#c8a57a' };
  const ext = { ...like, exterior: true };
  edit(() => { f.rooms.push(room); f.walls.push(wallAt(x, z, x + 3, z, ext), wallAt(x + 3, z, x + 3, z + 3, ext), wallAt(x + 3, z + 3, x, z + 3, ext), ...(b ? [] : [wallAt(x, z + 3, x, z, ext)])); tidy(f); });
  select(room.id);
}
// Ny etasje øverst med samme planløsning som etasjen under: samme vegger og rom, vinduer og innerdører, men ingen
// ytterdører og ingen møbler. Taket flyttes opp av seg selv.
function addFloor() {
  const below = S.house.floors.at(-1), b = bounds(below) || { x0: 0, x1: 6, z0: 0, z1: 5 }, n = S.house.floors.length + 1;
  const walls = below.walls.length ? below.walls.map(w => ({ ...clone(w), id: uid('w'), openings: w.openings.filter(o => !(w.exterior && o.type === 'door')).map(o => ({ ...o, id: uid('o') })) }))
    : [[b.x0, b.z1, b.x1, b.z1], [b.x1, b.z1, b.x1, b.z0], [b.x1, b.z0, b.x0, b.z0], [b.x0, b.z0, b.x0, b.z1]].map(p => wallAt(...p, { exterior: true }));
  const rooms = below.rooms.length ? below.rooms.map((r, i) => ({ ...r, id: uid('r'), name: `Rom ${i + 1}` }))
    : [{ id: uid('r'), name: 'Rom', x: b.x0, z: b.z0, w: round(b.x1 - b.x0), d: round(b.z1 - b.z0), material: 'tre', color: '#c8a57a' }];
  const f = { id: uid('f'), name: `${n}. etasje`, height: Math.min(below.height, 2.6), furniture: [], rooms, walls };
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

// Bilder inn → 3D-modell. Bildene krympes i nettleseren (lang side 1280 px, JPEG) og sendes til serveren, som spør Claude.
// S.photos: [{ key, name, data, thumb }]. S.prep: krymping pågår { done, total }. S.job: tolkning pågår { stage, part, chars, t0, xhr }.
// S.server: 'ok' | 'nokey' | 'none' (ingen Husform-server svarte) | null (ikke sjekket ennå).
const MIN = 5, MAX = 30, MAX_MB = 40, SIDE = 1280, THUMB = 168, MAX_DATA = 900e3;
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { // eldre nettlesere og formater createImageBitmap ikke tar: prøv vanlig <img>
    const url = URL.createObjectURL(file), img = new Image(); img.src = url;
    try { await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }
}
function jpeg(src, side, q) {
  const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, k = Math.min(1, side / Math.max(W, H));
  const c = h('canvas', { width: Math.max(1, Math.round(W * k)), height: Math.max(1, Math.round(H * k)) }), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', q); c.width = c.height = 0; return url;
}
async function shrink(file) {
  const src = await decode(file);
  try {
    let data = jpeg(src, SIDE, .82);
    if (data.length > MAX_DATA) data = jpeg(src, SIDE, .6);
    if (data.length > MAX_DATA) data = jpeg(src, 1024, .6);
    return { data, thumb: jpeg(src, THUMB, .7) };
  } finally { src.close?.(); }
}
const names = (list, max = 3) => list.slice(0, max).map(n => Array.isArray(n) ? `«${n[0]}» (${n[1]})` : `«${n}»`).join(', ') + (list.length > max ? ` og ${list.length - max} til` : '');
async function addPhotos(files) {
  const bad = { type: [], big: [], read: [] }; let dup = 0, over = 0; const todo = [];
  for (const f of files) {
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (S.photos.some(p => p.key === key) || todo.some(t => t.key === key)) dup++;
    else if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name)) bad.type.push(f.name);
    else if (f.size > MAX_MB * 1e6) bad.big.push([f.name, `${Math.round(f.size / 1e6)} MB`]);
    else if (S.photos.length + todo.length >= MAX) over++;
    else todo.push({ f, key });
  }
  S.note = ''; S.prep = todo.length ? { done: 0, total: todo.length } : null; ui();
  for (const { f, key } of todo) {
    try { S.photos.push({ key, name: f.name, ...await shrink(f) }); }
    catch { bad.read.push(f.name); }
    S.prep.done++; ui();
  }
  S.prep = null;
  const heic = bad.read.some(n => /\.hei[cf]$/i.test(n));
  S.note = [
    bad.type.length && `${names(bad.type)} er ikke ${bad.type.length > 1 ? 'bilder' : 'et bilde'} og ble hoppet over.`,
    bad.big.length && `${names(bad.big)} er for ${bad.big.length > 1 ? 'store' : 'stor'}. Hvert bilde kan være høyst ${MAX_MB} MB.`,
    bad.read.length && `${names(bad.read)} kunne ikke leses som ${bad.read.length > 1 ? 'bilder' : 'bilde'}.${heic ? ' HEIC-bilder fra iPhone kan bare leses i Safari. Velg dem fra iPhonen, eller lagre dem som JPEG.' : ''}`,
    over && `Du kan bruke høyst ${MAX} bilder, så ${over} ${over > 1 ? 'bilder' : 'bilde'} ble ikke lagt til.`,
    dup && `${dup > 1 ? `${dup} bilder` : 'Ett bilde'} var valgt fra før.`,
  ].filter(Boolean).join(' ');
  ui();
}
function removePhoto(i) { S.photos.splice(i, 1); S.note = ''; ui(); }
async function checkServer() {
  try {
    const r = await fetch('api/status', { cache: 'no-store' }), j = await r.json();
    S.server = j.ai ? 'ok' : 'nokey';
  } catch { S.server = 'none'; }
  if (S.sheet === 'photos') ui();
}

// Fremdrift: sending (0–15 %), Claude ser på bildene (15–50 %, etter tid), Claude skriver modellen (50–80 %, etter mengde tekst),
// kontroll, og eventuelt en rette-runde der Claude retter feil kontrollen fant (82–97 %).
const STAGES = {
  send: 'Sender bildene til serveren', wait: 'Venter på Claude', look: 'Claude ser på bildene og finner ut hvordan huset henger sammen',
  write: 'Claude skriver ned modellen', check: 'Kontrollerer modellen', fix: 'Claude retter feil som kontrollen fant', draw: 'Tegner modellen',
};
const ease = (x, k) => 1 - Math.exp(-x / k);
function jobState() {
  const j = S.job, secs = (Date.now() - j.t0) / 1000;
  const pct = { send: 15 * j.part, wait: 15, look: 15 + 35 * ease(secs - j.t1, 90), write: 50 + 30 * ease(j.chars, 20000), check: 82,
    fix: 82 + 15 * ease(j.chars, 20000) }[j.stage] ?? 99;
  const time = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  const extra = j.stage === 'send' ? `${Math.round(j.part * 100)} %` : /write|fix/.test(j.stage) && j.chars >= 1000 ? `${Math.round(j.chars / 1000)} kB` : '';
  return { pct, text: `${STAGES[j.stage]} …${extra ? ` ${extra}` : ''}`, time };
}
// Oppdaterer fremdriften der den vises (arket eller banneret), uten å tegne resten av grensesnittet på nytt.
function showJob() {
  if (!S.job) return;
  const { pct, text, time } = jobState();
  for (const el of document.querySelectorAll('.job')) {
    el.querySelector('.bar i').style.width = `${pct.toFixed(1)}%`;
    el.querySelector('.bar').ariaValueNow = Math.round(pct);
    el.querySelector('.job-text').textContent = text;
    const t = el.querySelector('.job-time'); if (t) t.textContent = `Tid brukt: ${time}. Det tar vanligvis 1–4 minutter.`;
  }
}
const jobView = (small) => h('div', { className: 'job' + (small ? ' small' : '') },
  h('p', { className: 'job-text', role: 'status' }),
  h('div', { className: 'bar', role: 'progressbar', ariaLabel: 'Fremdrift', ariaValueMin: 0, ariaValueMax: 100 }, h('i')),
  !small && h('p', { className: 'job-time hint' }));

const failed = msg => Object.assign(new Error(msg), { shown: true });
function httpError(status, j) {
  if (j?.error) return failed(j.error);
  if (status === 404 || status === 405) return failed('Fant ikke bildetolkningen på serveren. Appen ser ut til å kjøre uten Husform-serveren (f.eks. som statiske filer). Start den med node server.js.');
  if (status === 413) return failed('Bildene er for store til sammen. Bruk færre bilder.');
  if (status >= 502 && status <= 504) return failed(`Serveren svarte ikke (feil ${status}). Sjekk at node server.js kjører, og prøv igjen.`);
  return failed(`Serveren svarte med feil ${status}. Prøv igjen.`);
}
// Sender bildene med XMLHttpRequest, som gir fremdrift både for opplastingen og for svaret serveren strømmer tilbake.
function post(images) {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest(); S.job.xhr = x;
    let seen = 0, done = null, error = null;
    const stage = (st, o = {}) => {
      if (st !== S.job.stage) { if (st === 'look') S.job.t1 = (Date.now() - S.job.t0) / 1000; S.job.chars = 0; }
      Object.assign(S.job, { stage: st }, o); showJob();
    };
    const read = () => {
      if (!x.getResponseHeader('Content-Type')?.includes('ndjson')) return;
      const t = x.responseText; let i;
      while ((i = t.indexOf('\n', seen)) >= 0) {
        let m; try { m = JSON.parse(t.slice(seen, i)); } catch { m = null; } seen = i + 1;
        if (m?.type === 'progress') stage(m.stage, m.chars != null ? { chars: m.chars } : {});
        else if (m?.type === 'done') done = m;
        else if (m?.type === 'error') error = m.error;
      }
    };
    x.open('POST', 'api/analyze'); x.setRequestHeader('Content-Type', 'application/json'); x.timeout = 15 * 60e3;
    x.upload.onprogress = e => e.lengthComputable && stage('send', { part: e.loaded / e.total });
    x.upload.onload = () => stage('wait');
    x.onprogress = read;
    x.onload = () => {
      if (x.status !== 200) { let j = null; try { j = JSON.parse(x.responseText); } catch {} return no(httpError(x.status, j)); }
      read();
      if (!x.getResponseHeader('Content-Type')?.includes('ndjson')) { try { done = JSON.parse(x.responseText); } catch {} }
      if (error) no(failed(error)); else if (done?.house) ok(done);
      else no(failed('Svaret fra serveren stoppet før modellen var ferdig. Prøv igjen.'));
    };
    x.onerror = () => no(failed(navigator.onLine === false ? 'Mobilen er uten nett. Koble til og prøv igjen.'
      : 'Mistet kontakten med serveren. Sjekk at node server.js kjører og at du er på nett. Hold skjermen på og appen åpen mens tolkningen pågår, og prøv igjen.'));
    x.ontimeout = () => no(failed('Serveren brukte mer enn 15 minutter. Prøv igjen, gjerne med færre bilder.'));
    x.onabort = () => no(Object.assign(new Error('Avbrutt.'), { aborted: true }));
    x.send(JSON.stringify({ images }));
  });
}
async function analyze() {
  if (S.job || S.photos.length < MIN) return;
  S.job = { stage: 'send', part: 0, chars: 0, t0: Date.now(), t1: 0 }; S.note = ''; ui(); showJob(); $('#panel').scrollTop = 0;
  const timer = setInterval(showJob, 1000);
  const lock = await navigator.wakeLock?.request('screen').catch(() => null); // hindrer at mobilen sovner og bryter forbindelsen
  try {
    const res = await post(S.photos.map(p => p.data));
    S.job.stage = 'draw'; showJob();
    let house;
    try { house = normalize(res.house); } catch (e) { throw failed(`Claude svarte, men modellen kunne ikke brukes: ${e.message} Prøv igjen.`); }
    S.photos = []; S.job = null; replace(house);
    S.report = res.report || { fixed: [], problems: [], guesses: '' }; sheet('report');
  } catch (e) {
    S.job = null;
    if (!e.shown && !e.aborted) console.error(e);
    say(e.aborted ? 'Tolkningen ble avbrutt. Bildene er fortsatt valgt.' : e.shown ? e.message : `Noe gikk galt: ${e.message}`);
  } finally { clearInterval(timer); lock?.release().catch(() => {}); }
}
function cancelJob() { S.job?.xhr?.abort(); }
// Etter tolkningen: hva kontrollen rettet, hva som bør sjekkes, og hva Claude anslo uten å se det.
function reportSheet() {
  const { fixed = [], problems = [], guesses = '' } = S.report || {}, items = l => h('ul', {}, l.map(t => h('li', { textContent: t })));
  return [head(S.house.name, 'Modellen er klar', () => sheet(null)),
    h('p', { className: 'hint', textContent: 'Målene er anslag. Trykk på en vegg, et rom, et vindu eller et møbel for å rette det.' }),
    h('div', { className: 'report' },
      problems.length ? [h('h3', { textContent: 'Bør sjekkes' }), items(problems)] : h('p', { textContent: 'Kontrollen fant ingen feil som står igjen.' }),
      guesses && [h('h3', { textContent: 'Anslått uten å synes i bildene' }), h('p', { textContent: guesses })],
      fixed.length > 0 && h('details', {}, h('summary', { textContent: `Kontrollen rettet ${fixed.length} ting automatisk` }), items(fixed))),
    btn('Se modellen', () => sheet(null), { className: 'primary' })];
}
function photoSheet() {
  const n = S.photos.length, busy = !!S.job, prep = S.prep;
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { const f = [...e.target.files]; e.target.value = ''; addPhotos(f); } });
  const intro = { ok: `Velg ${MIN}–${MAX} bilder av ett hus, både ute og inne: alle sider av huset utenfra, og hvert rom innenfra. Jo flere vinkler, jo bedre modell. Målene blir anslag som du kan rette etterpå.`,
    nokey: 'Serveren har ingen API-nøkkel for Claude, så bildene kan ikke tolkes. Den som driver serveren, må legge ANTHROPIC_API_KEY=... i filen .env og starte node server.js på nytt. Imens kan du prøve appen med demohuset.',
    none: 'Fant ingen Husform-server å sende bildene til. Bildetolkning krever at appen kjøres med node server.js (ikke som statiske filer) og at du er på nett. Imens kan du prøve appen med demohuset.' }[S.server] || 'Sjekker serveren …';
  const ok = S.server === 'ok';
  const status = ok && [
    h('div', { className: 'count' },
      h('strong', { textContent: `${n} av ${MAX} bilder valgt` }),
      h('span', { textContent: prep ? `Krymper bilde ${Math.min(prep.done + 1, prep.total)} av ${prep.total} …` : n < MIN ? `Velg minst ${MIN - n} til` : '' })),
    S.note && h('p', { className: 'note', role: 'status', textContent: S.note })];
  const grid = ok && h('ul', { className: 'photos', ariaLabel: 'Valgte bilder' },
    S.photos.map((p, i) => h('li', {}, h('img', { src: p.thumb, alt: p.name }),
      btn('✕', () => removePhoto(i), { className: 'del', ariaLabel: `Fjern ${p.name}`, disabled: busy }))),
    n + (prep ? prep.total - prep.done : 0) < MAX && !busy && h('li', {}, file, btn(prep ? '…' : '+ Legg til', () => file.click(), { className: 'pick', disabled: !!prep })));
  const go = ok && !busy && btn(n < MIN ? `Velg minst ${MIN} bilder (${n} valgt)` : `Lag 3D-modell av ${n} bilder`, analyze, { className: 'primary', disabled: n < MIN || !!prep });
  // Mens tolkningen pågår, står fremdriften øverst så den synes uten å rulle.
  return [head('Nytt hus', 'Fra bilder til 3D', () => sheet(null)),
    busy ? [jobView(false), btn('Avbryt', cancelJob, { className: 'secondary' })] : h('p', { className: 'hint', textContent: intro }),
    status, grid, go,
    S.server === 'none' && btn('Prøv å nå serveren igjen', () => { S.server = null; ui(); checkServer(); }, { className: 'secondary' }),
    !ok && S.server && btn('Åpne demohuset', () => replace(clone(DEMO)), { className: 'primary' })].flat();
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
  view.build(S.house, { floor: null }); view.setWalk({ x, z, y: eye(i), yaw: 0, walls: solid(f) }); select(null);
}
// Veggene i en etasje som stykker du ikke kan gå gjennom. Døråpninger er hull i veggen.
function solid(f) {
  const out = [];
  for (const w of f.walls) {
    const L = wallLength(w), r = w.thickness / 2 + .2, ux = (w.x2 - w.x1) / (L || 1), uz = (w.z2 - w.z1) / (L || 1);
    let at = 0;
    for (const o of [...w.openings].filter(o => o.type === 'door' && o.height >= 1.8).sort((a, b) => a.pos - b.pos)) {
      const a = o.pos - o.width / 2, b = o.pos + o.width / 2;
      if (a > at) out.push([w.x1 + ux * at, w.z1 + uz * at, w.x1 + ux * a, w.z1 + uz * a, r]);
      at = Math.max(at, b);
    }
    if (at < L) out.push([w.x1 + ux * at, w.z1 + uz * at, w.x2, w.z2, r]);
  }
  return out;
}
const eye = i => S.house.floors.slice(0, i).reduce((s, f) => s + f.height, 0) + Math.min(1.6, S.house.floors[i].height - .3);
function leave() { S.walk = null; stick(0, 0); view.setWalk(null); draw(); ui(); }
function climb(d) {
  const i = S.walk.floor + d; if (!S.house.floors[i]) return;
  S.walk.floor = i; const p = view.camera.position; view.setWalk({ x: p.x, z: p.z, y: eye(i), walls: solid(S.house.floors[i]) }); ui();
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
  const content = f ? selectionPanel(f) : S.sheet === 'add' ? addSheet() : S.sheet === 'photos' ? photoSheet() : S.sheet === 'more' ? moreSheet() : S.sheet === 'report' ? reportSheet() : null;
  const job = S.job && S.sheet !== 'photos';
  const banner = S.placing ? `Trykk på veggen der ${S.placing === 'door' ? 'døren' : 'vinduet'} skal stå.` : !content && (job || S.note);
  document.body.className = [content && 'has-panel', f && S.move && 'moving', S.walk && 'walk', (S.placing || banner) && 'has-banner', localStorage.tipSeen && 'seen'].filter(Boolean).join(' ');
  el.replaceChildren(...(content || []).filter(Boolean), ...(content && S.note && S.sheet !== 'photos' ? [h('p', { className: 'note', role: 'status', textContent: S.note })] : []));
  $('#banner').replaceChildren(...(!banner ? [] : job && !S.placing ? [jobView(true), btn('Vis', () => sheet('photos'))]
    : [h('span', { textContent: S.placing ? (S.note || banner) : banner }), btn(S.placing ? 'Avbryt' : 'OK', () => { S.placing = null; say(''); })]));
  showJob();
  const fl = S.house.floors, chip = (label, on, fn) => btn(label, fn, { ariaPressed: String(on) });
  $('#floors').replaceChildren(...(S.walk
    ? [btn('Ut av huset', leave, { className: 'out' }), fl.length > 1 && btn('Opp', () => climb(1), { disabled: !fl[S.walk.floor + 1] }), fl.length > 1 && btn('Ned', () => climb(-1), { disabled: !S.walk.floor })]
    : [chip('Hele huset', S.floor === null, () => showFloor(null)), ...fl.map((x, i) => chip(x.name, S.floor === i, () => showFloor(i)))]).filter(Boolean));
  const wide = matchMedia('(min-width: 760px)').matches;
  view.setInset(content && wide ? el.offsetWidth + 10 : 0, content && !wide ? el.offsetHeight : 0);
}
// Bytter mellom hele huset og én etasje. Etasjevisningen ser ned i rommene ovenfra, så alt kan trykkes på.
function showFloor(i) {
  const was = S.floor; S.floor = i; const f = S.sel && find(S.house, S.sel); if (f && (f.kind === 'roof' ? i !== null : i !== null && f.index > i)) S.sel = null;
  cancelAnimationFrame(drawT); drawT = 0; view.build(S.house, { floor: shown() }); view.select(S.sel);
  if ((was === null) !== (i === null)) view.frame(i !== null);
  ui();
}

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
    else if (f.kind === 'wall') moveWall(f.floor, it, dx, dz);
    else if (f.kind === 'opening') { const w = f.wall, L = wallLength(w) || 1; it.pos = round(it.pos + (dx * (w.x2 - w.x1) + dz * (w.z2 - w.z1)) / L); fitOpenings(w); }
  }, false);
  ui();
});
const up = e => {
  if (!down || e.pointerId !== down.id) return;
  const d = down; down = null;
  if (d.drag) { view.controls.enabled = !S.walk; commit(); }
  else if (e.type === 'pointerup' && !d.far) { if (e.pointerType === 'touch') tapped = performance.now(); const hit = view.pick(e); if (S.placing) placeOn(hit); else if (S.sheet && !hit) sheet(null); else select(hit?.id); }
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
// Etter et trykk sender mobilen et klikk til samme sted. Har panelet nettopp åpnet seg der, ville klikket truffet en knapp
// i panelet (f.eks. Lukk). Slike klikk rett etter et trykk i 3D-visningen ignoreres.
let tapped = 0;
addEventListener('click', e => { if (performance.now() - tapped < 350 && e.target !== cv) { e.stopPropagation(); e.preventDefault(); } }, true);

$('#undo').onclick = () => {
  const s = S.undo.pop(); if (!s) return;
  S.house = JSON.parse(s); S.pending = null; $('#undo').disabled = !S.undo.length;
  if (S.walk && !S.house.floors[S.walk.floor]) leave();
  if (S.floor !== null && !S.house.floors[S.floor]) S.floor = null;
  select(S.sel); save();
};
$('#b-photos').onclick = () => { sheet('photos'); checkServer(); }; $('#b-add').onclick = () => sheet('add'); $('#b-more').onclick = () => sheet('more'); $('#b-walk').onclick = enter;
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

checkServer();
db('readonly', s => s.get('house')).then(saved => {
  try { if (saved?.version === 1) S.house = normalize(saved); } catch {}
  view.build(S.house, { floor: null }); view.frame(); ui(); window.husformReady = true;
});
