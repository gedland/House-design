import { DEMO, MATERIALS, FURNITURE, OPENINGS, ROOFS, find, round, uid, normalize, bounds, wallLength, wallAngle, setWall, reshapeRoom, shiftWall, setWallLength, fitOpenings, removeRoom, inspect } from './house.js';
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
const db = (mode, fn) => DB.then(d => new Promise((ok, no) => { const tx = d.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => ok(q.result); tx.onerror = tx.onabort = () => no(tx.error || q.error); }));
// save() venter litt mens brukeren skriver eller drar, save(true) lagrer med en gang. Feiler lagringen, får brukeren vite det én gang.
let saveT = 0, saveFailed = false;
function save(now) {
  clearTimeout(saveT); saveT = 0;
  if (!now) { saveT = setTimeout(save, 300, true); return; }
  db('readwrite', s => s.put(S.house, 'house')).then(() => { saveFailed = false; try { localStorage.removeItem('husformUnsaved'); } catch {} }, () => {
    if (saveFailed) return; saveFailed = true;
    say('Huset kunne ikke lagres i nettleseren (privat modus eller fullt lager). Bruk «Mer» og «Eksporter JSON» for å ta vare på det.');
  });
}
// Lagrer det som ikke er lagret ennå, f.eks. et felt brukeren står i når siden lukkes eller lastes på nytt.
// IndexedDB rekker ikke alltid å skrive mens siden lukkes, så huset legges også synkront i localStorage og hentes derfra ved neste start.
function flush() {
  const unsaved = S.pending || saveT; commit();
  if (unsaved) { try { localStorage.husformUnsaved = JSON.stringify(S.house); } catch {} save(true); }
}
addEventListener('pagehide', flush); document.addEventListener('visibilitychange', () => document.hidden && flush());
// Sammenligner to verdier uten å bry seg om rekkefølgen på nøklene.
const same = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k])));

// Alle endringer går gjennom edit(): JSON endres, 3D tegnes på nytt. commit() lagrer og legger et angre-steg.
let drawT = 0;
const shown = () => S.walk ? null : S.floor;
function draw() { if (drawT) return; drawT = requestAnimationFrame(() => { drawT = 0; view.build(S.house, { floor: shown() }); view.select(S.sel); }); }
function edit(fn, done = true) { S.pending ??= JSON.stringify(S.house); fn(); draw(); if (done) commit(); else save(); }
// Mens et felt skrives i eller et objekt dras, regnes hver endring fra huset slik det var før, så mellomtrinn ikke setter spor.
function restore() { if (S.pending) S.house = JSON.parse(S.pending); }
// Huset går gjennom normalize() ved hver commit, så JSON-en som lagres og eksporteres alltid er den samme som leses inn igjen.
// Verdier utenfor grensene (f.eks. 12 m takhøyde) rettes her, og da tegnes panelet på nytt så feltet viser den rettede verdien.
function commit() {
  const before = S.pending; S.pending = null;
  if (before) {
    const raw = S.house; try { S.house = normalize(raw); } catch {}
    if (before !== JSON.stringify(S.house)) { S.undo.push(before); if (S.undo.length > 50) S.undo.shift(); }
    save(true);
    if (!same(raw, S.house)) { draw(); ui(); }
  }
  $('#undo').disabled = !S.undo.length;
}
// Bytter ut hele huset. Det gamle huset blir et angre-steg.
function replace(house) {
  S.undo.push(S.pending || JSON.stringify(S.house)); if (S.undo.length > 50) S.undo.shift();
  S.house = house; S.sel = null; S.move = false; S.floor = null; S.sheet = null; S.pending = null; S.placing = null; S.note = '';
  $('#undo').disabled = false; if (S.walk) leave(); view.build(S.house, { floor: null }); view.frame(false, { intro: true }); ui(); save(true);
}
function select(id) {
  commit();
  if (id !== S.sel) S.move = false;
  S.sel = id && find(S.house, id) ? id : null; if (S.sel) { S.sheet = null; localStorage.tipSeen = 1; }
  draw(); ui();
}
const say = (note = '') => { S.note = note; ui(); };

// Panelet: feltene for det valgte objektet
const num = (key, label, min = 0, step = .05, max = 500) => ({ key, label, type: 'number', min, step, max });
const opts = o => Object.entries(o).map(([v, x]) => [v, x.label || x]);
const colorF = (label = 'Farge') => ({ key: 'color', label, type: 'color' }), matF = (label = 'Materiale') => ({ key: 'material', label, type: 'select', options: opts(MATERIALS) });
const FIELDS = {
  room: [{ key: 'name', label: 'Navn', type: 'text', wide: true }, num('w', 'Bredde (m)', .5), num('d', 'Dybde (m)', .5), num('height', 'Takhøyde (m)', 1, .05, 6), matF('Gulv'), colorF('Gulvfarge'), num('x', 'Plassering X (m)', -500), num('z', 'Plassering Z (m)', -500)],
  wall: [colorF(), matF(), num('length', 'Lengde (m)', .2), num('angle', 'Retning (°)', -360, 15), num('thickness', 'Tykkelse (m)', .05, .01, .6)],
  opening: [{ key: 'type', label: 'Type', type: 'select', options: opts(OPENINGS) }, colorF(), matF(), num('width', 'Bredde (m)', .3), num('height', 'Høyde (m)', .3), num('sill', 'Høyde over gulv (m)'), num('pos', 'Avstand langs vegg (m)')],
  furniture: [{ key: 'type', label: 'Type', type: 'select', options: opts(FURNITURE) }, colorF(), matF(), num('w', 'Bredde (m)', .1), num('d', 'Dybde (m)', .1), num('h', 'Høyde (m)', .1), num('rot', 'Rotasjon (°)', -360, 15), num('x', 'Plassering X (m)', -500), num('z', 'Plassering Z (m)', -500)],
  roof: [{ key: 'type', label: 'Takform', type: 'select', options: opts(ROOFS) }, colorF(), matF(), num('pitch', 'Takvinkel (°)', 5, 1, 60), num('overhang', 'Takutstikk (m)', 0, .05, 2)],
};
const MOVE_HINT = { room: 'Dra i 3D-visningen. Veggene rundt rommet følger med, og naborommene gir plass.', wall: 'Dra i 3D-visningen. Vegger som møter denne følger med, og rommene langs den endrer størrelse.', opening: 'Dra i 3D-visningen for å flytte langs veggen.', furniture: 'Dra i 3D-visningen for å flytte møbelet.' };
const KIND = { room: 'Rom', wall: 'Vegg', opening: 'Åpning', furniture: 'Møbel', roof: 'Tak' };
const title = f => f.kind === 'room' ? f.item.name || 'Rom' : f.kind === 'wall' ? 'Vegg' : f.kind === 'roof' ? ROOFS[f.item.type] : f.kind === 'opening' ? OPENINGS[f.item.type].label : FURNITURE[f.item.type]?.label || 'Møbel';
function getValue(f, key) {
  if (f.kind === 'wall' && key === 'length') return round(wallLength(f.item));
  if (f.kind === 'wall' && key === 'angle') return wallAngle(f.item);
  if (f.kind === 'room' && key === 'height') return f.floor.height;
  return f.item[key];
}
function setValue(f, key, v) {
  const H = f.floor?.height;
  if (f.kind === 'wall' && key === 'length') setWallLength(f.floor, f.item, v);
  else if (f.kind === 'wall' && key === 'angle') { setWall(f.item, wallLength(f.item), v); fitOpenings(f.item); }
  else if (f.kind === 'room' && key === 'height') { f.floor.height = v; for (const w of f.floor.walls) fitOpenings(w, v); }
  else if (f.kind === 'room' && 'xzwd'.includes(key)) reshapeRoom(f.floor, f.item, { [key]: v });
  else if (key === 'type' && f.kind === 'opening') { const { label, width, color, ...d } = OPENINGS[v]; Object.assign(f.item, d, { type: v }); } // ny type får riktig høyde, brystning og materiale
  else if (key === 'type' && f.kind === 'furniture') { const { label, ...d } = FURNITURE[v]; Object.assign(f.item, d, { type: v }); }
  else f.item[key] = v;
  if (f.kind === 'opening') fitOpenings(f.wall, H);
}
const head = (small, big, close) => h('div', { className: 'head' }, h('div', {}, small && h('small', { textContent: small }), h('h2', { textContent: big })), btn('✕', close, { className: 'icon', ariaLabel: 'Lukk' }));
function selectionPanel(f) {
  const inputs = [];
  // Viser verdiene slik de ble etter endringen, f.eks. når et mål ble stoppet av en nabo. Feltet det skrives i får stå i fred.
  const sync = all => { const g = find(S.house, S.sel); if (g) for (const [d, el] of inputs) if (all || el !== document.activeElement) el.value = getValue(g, d.key) ?? ''; };
  const fields = FIELDS[f.kind].map(d => {
    const v = getValue(f, d.key);
    const input = d.type === 'select'
      ? h('select', {}, d.options.map(([value, label]) => h('option', { value, textContent: label, selected: value === v })))
      : h('input', { type: d.type, value: v ?? '', ...(d.type === 'text' ? { maxLength: 40 } : {}), ...(d.type === 'number' ? { min: d.min, max: d.max, step: d.step, inputMode: 'decimal' } : {}) });
    input.oninput = () => {
      let val = input.value;
      if (d.type === 'number') { val = round(parseFloat(val.replace(',', '.'))); if (!isFinite(val) || val < d.min) return; val = Math.min(val, d.max); }
      restore(); edit(() => setValue(find(S.house, S.sel), d.key, val), false); sync();
      if (d.key === 'name' || d.key === 'type') $('#panel h2').textContent = title(find(S.house, S.sel));
    };
    input.onchange = () => { commit(); sync(true); };
    inputs.push([d, input]);
    return h('label', { className: d.wide ? 'wide' : '' }, h('span', { textContent: d.label }), input);
  });
  return [head(KIND[f.kind], title(f), () => select(null)),
    h('div', { className: 'acts' },
      f.kind !== 'roof' && btn(S.move ? 'Ferdig flyttet' : 'Flytt', () => { S.move = !S.move; ui(); }, { ariaPressed: String(S.move) }),
      btn('Slett', remove, { className: 'danger' })),
    S.move ? h('p', { className: 'hint', textContent: MOVE_HINT[f.kind] }) : f.kind === 'roof' && h('p', { className: 'hint', textContent: 'Taket følger ytterveggene. Flytt en yttervegg, så flytter taket seg.' }),
    h('div', { className: 'fields' }, fields)];
}
function remove() {
  const f = find(S.house, S.sel); if (!f) return;
  edit(() => { if (f.kind === 'roof') S.house.roof = null; else if (f.kind === 'room') removeRoom(f.floor, f.item); else f.list.splice(f.list.indexOf(f.item), 1); }); select(null);
}

// Legg til nye objekter. De havner midt i bildet, på etasjen som vises.
const floorIndex = () => S.walk ? S.walk.floor : S.floor ?? 0;
function spot() {
  const c = S.walk ? view.camera.position : view.controls.target, b = bounds(S.house.floors[floorIndex()]) || { x0: -50, x1: 50, z0: -50, z1: 50 };
  return { x: snap(Math.min(b.x1, Math.max(b.x0, c.x))), z: snap(Math.min(b.z1, Math.max(b.z0, c.z))) };
}
// Det som legges til inne i huset, skal synes: vis etasjen uten tak i stedet for hele huset.
function inside() { if (!S.walk && S.floor === null) showFloor(0); }
function add(key, item, move = true) {
  item.id = uid(key[0] === 'f' ? 'm' : key[0]);
  edit(() => S.house.floors[floorIndex()][key].push(item)); inside(); select(item.id); S.move = move; ui();
}
const wallAt = (x1, z1, x2, z2, like) => ({ id: uid('w'), x1, z1, x2, z2, thickness: like?.thickness ?? .2, exterior: like?.exterior ?? false, material: like?.material ?? 'panel', color: like?.color ?? '#e9e4d8', openings: [] });
function addFurniture(type) { const { label, ...d } = FURNITURE[type]; add('furniture', { type, ...spot(), rot: 0, ...d }); }
function addWall() {
  const p = spot(), b = bounds(S.house.floors[floorIndex()]), x1 = Math.max(b?.x0 ?? -Infinity, p.x - 1.5), x2 = Math.max(x1 + 1, Math.min(b?.x1 ?? Infinity, p.x + 1.5));
  add('walls', wallAt(x1, p.z, x2, p.z, { thickness: .1, material: 'maling', color: '#f1eee7' }));
}
function addRoom() {
  const f = S.house.floors[floorIndex()], b = bounds(f), x = b ? b.x1 : 0, z = b ? b.z0 : 0, like = f.walls[0];
  const room = { id: uid('r'), name: 'Nytt rom', x, z, w: 3, d: 3, material: 'tre', color: '#c8a57a' };
  edit(() => { f.rooms.push(room); f.walls.push(wallAt(x, z, x + 3, z, like), wallAt(x + 3, z, x + 3, z + 3, like), wallAt(x + 3, z + 3, x, z + 3, like), ...(b ? [] : [wallAt(x, z + 3, x, z, like)])); });
  inside(); select(room.id);
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
  const { label, ...d } = OPENINGS[S.placing], L = wallLength(wall);
  if (L < .6) return say('Veggen er for kort. Velg en lengre vegg.');
  const t = ((hit.point.x - wall.x1) * (wall.x2 - wall.x1) + (hit.point.z - wall.z1) * (wall.z2 - wall.z1)) / L;
  const o = { id: uid('o'), type: S.placing, pos: snap(t), ...d };
  edit(() => { wall.openings.push(o); fitOpenings(wall, f.floor.height); }, false);
  if (wall.openings.some(p => p !== o && Math.abs(p.pos - o.pos) < (p.width + o.width) / 2)) { restore(); S.pending = null; return say(`Der står det allerede en dør eller et vindu. Trykk på et ledig sted på veggen.`); }
  S.placing = null; S.note = ''; commit(); select(o.id);
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
// Filnavn med bare a–z og tall, så nedlastingen får riktig navn på alle telefoner og maskiner.
const fileName = ext => `${S.house.name.replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o').replace(/[åÅ]/g, 'a').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'hus'}.${ext}`;
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
  try {
    const j = JSON.parse(await file.text());
    if (j?.version > 1) throw new Error('Den er laget i en nyere versjon av Husform. Oppdater appen og prøv igjen.');
    if (j?.version === 1) return replace(normalize(j));
    // Filen kommer fra et annet verktøy: oversett den, og la kontrollen tette det som mangler (tak, åpne yttervegger).
    const { house, problems } = inspect(normalize(j), { final: true });
    replace(house); say(`Filen var ikke laget i Husform og ble oversatt. ${problems.length ? `${problems[0].text} ` : ''}Sjekk at mål og plassering stemmer.`);
  } catch (e) { say(`Filen kunne ikke leses som et hus. ${e instanceof SyntaxError ? 'Den er ikke gyldig JSON.' : e.message}`); }
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
function sheet(name) { commit(); S.sheet = name; S.sel = null; S.move = false; S.placing = null; S.note = ''; draw(); ui(); }

// Interiørmodus
const inRoom = (f, x, z) => f.rooms.find(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
// Kameraet flyr inn gjennom det største vinduet i det største rommet (eller en ytterdør), og ender et stykke inn i rommet med blikket innover.
function entrance(f, i) {
  const big = [...f.rooms].sort((a, b) => b.w * b.d - a.w * a.d)[0]; let best = null;
  for (const w of f.walls) if (w.exterior) for (const o of w.openings) {
    const L = wallLength(w), ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, side = o.width > 1 ? o.width * .25 : 0; // utenom midtposten i brede vinduer
    const wx = w.x1 + ux * (o.pos + side), wz = w.z1 + uz * (o.pos + side);
    let nx = uz, nz = -ux, room = inRoom(f, wx - nx * .4, wz - nz * .4); // n = utover
    if (!room) { room = inRoom(f, wx + nx * .4, wz + nz * .4); if (!room) continue; nx = -nx; nz = -nz; }
    const score = (o.type === 'window' ? o.width * o.height : .3) + (room === big ? 5 : 0);
    if (!best || score > best.score) best = { score, wx, wz, nx, nz, o, room };
  }
  if (!best) return null;
  const { wx, wz, nx, nz, o, room } = best, y = floorY(i) + o.sill + Math.min(o.height / 2, 1.4);
  const deep = Math.min(.6, (Math.abs(nx) > .5 ? room.w : room.d) * .3); // like innenfor vinduet, så du ser mest mulig av rommet
  return [{ x: wx - nx * deep, z: wz - nz * deep, y: eye(i), yaw: Math.atan2(nx, nz), pitch: -.15 }, { out: [wx + nx * 3, y, wz + nz * 3], at: [wx, y, wz] }];
}
function enter() {
  const i = S.floor ?? 0, f = S.house.floors[i], r = [...f.rooms].sort((a, b) => b.w * b.d - a.w * a.d)[0], b = bounds(f);
  // Uten ytterdør eller vindu: start i den ene enden av det største rommet, med blikket langs rommet.
  const long = r && r.w >= r.d, x = r ? r.x + r.w * (long ? .2 : .5) : b ? (b.x0 + b.x1) / 2 : 0, z = r ? r.z + r.d * (long ? .5 : .8) : b ? (b.z0 + b.z1) / 2 : 0;
  S.walk = { floor: i }; S.sheet = null; S.placing = null;
  view.build(S.house, { floor: null }); view.setWalk(...(entrance(f, i) || [{ x, z, y: eye(i), yaw: long ? -Math.PI / 2 : 0 }])); select(null);
}
const floorY = i => S.house.floors.slice(0, i).reduce((s, f) => s + f.height, 0);
const eye = i => floorY(i) + Math.min(1.6, S.house.floors[i].height - .3);
function leave() { S.walk = null; S.here = null; stick(0, 0); view.setWalk(null); draw(); ui(); }
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
  setLabels(); caption();
}

// Romnavn som svever i rommene. I etasjevisningen velger et trykk rommet, inne i huset går du dit.
// Et navn vises bare når ingen vegg, gulv eller tak står mellom kameraet og rommet.
let labels = [], labelKey = '';
function setLabels() {
  const i = S.walk ? S.walk.floor : S.floor, f = i !== null && S.house.floors[i];
  const rooms = f && !S.placing && !S.move ? f.rooms : [], y = f ? (S.walk ? eye(i) - .25 : floorY(i) + 1) : 0;
  const key = JSON.stringify([!!S.walk, i, rooms.map(r => [r.id, r.name, r.x, r.z, r.w, r.d])]);
  if (key === labelKey) return; labelKey = key;
  labels = rooms.map(r => {
    // Punkter i rommet, midten først. Navnet står på det første som synes, så et rom du bare ser litt av gjennom en døråpning også får navn.
    const pts = [0, -.3, .3].flatMap(a => [0, -.3, .3].map(b => [r.x + r.w * (.5 + a), r.z + r.d * (.5 + b)])).sort((p, q) => Math.hypot(p[0] - r.x - r.w / 2, p[1] - r.z - r.d / 2) - Math.hypot(q[0] - r.x - r.w / 2, q[1] - r.z - r.d / 2));
    const l = { r, y, pts };
    l.el = btn(r.name, () => S.walk ? view.walkTo(...pts[0]) : select(r.id), { className: 'label off', ariaLabel: S.walk ? `Gå til ${r.name}` : `Velg ${r.name}` });
    return l;
  });
  $('#labels').replaceChildren(...labels.map(l => l.el));
  view.invalidate();
}
function placeLabels() {
  const p = view.camera.position, f = S.walk && S.house.floors[S.walk.floor], here = f && inRoom(f, p.x, p.z);
  for (const l of labels) {
    l.s = null;
    if (l.r !== here) for (const [x, z] of l.pts) { const q = view.screen(x, l.y, z); if (q && !view.hidden(x, l.y, z)) { l.s = q; l.d = Math.hypot(x - p.x, z - p.z); break; } }
  }
  // Nærmeste rom først. Et navn som ville havnet oppå et annet, skjules.
  const taken = [];
  for (const l of [...labels].sort((a, b) => (a.s ? a.d : 1e9) - (b.s ? b.d : 1e9))) {
    const s = l.s, w = (l.w ||= l.el.offsetWidth) / 2 + 4, hh = 20;
    const ok = s && !taken.some(([x, y, tw]) => Math.abs(x - s[0]) < tw + w && Math.abs(y - s[1]) < hh);
    if (ok) taken.push([s[0], s[1], w]);
    l.el.classList.toggle('off', !ok);
    if (s) l.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%)`;
  }
  if (S.walk && here !== S.here) { S.here = here; caption(); }
}
view.onFrame = placeLabels;

// Bildetekst øverst til venstre: hva du ser på, med anslåtte mål.
const m2 = rooms => Math.round(rooms.reduce((s, r) => s + r.w * r.d, 0));
const metres = v => v.toFixed(1).replace('.', ',');
function caption() {
  const fl = S.house.floors, all = fl.flatMap(f => f.rooms), rooms = n => `${n} rom`;
  let small, big, sub;
  if (S.walk) {
    const f = fl[S.walk.floor], r = S.here;
    small = f.name; big = r ? r.name : 'Inne i huset';
    sub = r ? `${metres(r.w)} × ${metres(r.d)} m, anslått` : 'Dra for å se deg om. Trykk på et romnavn for å gå dit.';
  } else if (S.floor !== null) {
    const f = fl[S.floor]; small = `Etasje ${S.floor + 1} av ${fl.length}`; big = f.name; sub = `${rooms(f.rooms.length)} · ca. ${m2(f.rooms)} m²`;
  } else {
    small = `${fl.length} ${fl.length === 1 ? 'etasje' : 'etasjer'} · ${rooms(all.length)}`; big = S.house.name; sub = `Ca. ${m2(all)} m². Målene er anslag.`;
  }
  const c = $('#caption'); c.children[0].textContent = small; c.children[1].textContent = big; c.children[2].textContent = sub;
}

// Dag- og kveldslys. Valget huskes i nettleseren; uten valg følger det mørk eller lys modus.
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
let mood = (() => { try { return localStorage.husformMood; } catch {} })() || (document.documentElement.dataset.theme === 'dark' ? 'evening' : 'day');
function setMood(m, keep) {
  mood = m; view.setMood(m); if (keep) try { localStorage.husformMood = m; } catch {}
  const b = $('#mood'), night = m === 'evening', label = night ? 'Dagslys' : 'Kveldslys';
  b.innerHTML = night ? SUN : MOON; b.ariaPressed = String(night); b.ariaLabel = label; b.title = label;
}
$('#mood').onclick = () => setMood(mood === 'evening' ? 'day' : 'evening', true);
setMood(mood);
function showFloor(i) { S.floor = i; const f = S.sel && find(S.house, S.sel); if (f && (f.kind === 'roof' ? i !== null : i !== null && f.index > i)) S.sel = null;
  cancelAnimationFrame(drawT); drawT = 0; view.build(S.house, { floor: shown() }); view.select(S.sel); view.frame(i !== null); ui();
}

// Pek og dra: trykk velger et objekt. Med «Flytt» på flytter dra det valgte objektet, ellers styrer dra kameraet.
const cv = $('#view'); let down = null;
cv.addEventListener('pointerdown', e => {
  if (down && !e.isPrimary) { down.far = true; return; } // en finger til (knip for å zoome) er ikke et trykk
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
  const p = view.planePoint(e, g.y); if (!p) return;
  const dx = snap(p.x - g.x), dz = snap(p.z - g.z);
  if (dx === g.ax && dz === g.az) return;
  g.ax = dx; g.az = dz; restore(); // hele flyttingen regnes fra der objektet sto da dra-bevegelsen startet
  const f = find(S.house, S.sel), it = f?.item; if (!f) return;
  edit(() => {
    if (f.kind === 'furniture') { it.x = round(it.x + dx); it.z = round(it.z + dz); }
    else if (f.kind === 'room') reshapeRoom(f.floor, it, { x: it.x + dx, z: it.z + dz });
    else if (f.kind === 'wall') shiftWall(f.floor, it, dx, dz);
    else if (f.kind === 'opening') { const w = f.wall, L = wallLength(w) || 1; it.pos = round(it.pos + (dx * (w.x2 - w.x1) + dz * (w.z2 - w.z1)) / L); fitOpenings(w); }
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
// Etter et trykk sender mobilnettlesere også et klikk. Panelet har da åpnet seg under fingeren, så klikket ville truffet «Slett» eller «Lukk». Stopp det.
cv.addEventListener('touchend', e => e.cancelable && e.preventDefault(), { passive: false });

$('#undo').onclick = () => {
  commit();
  const s = S.undo.pop(); if (!s) return;
  S.house = JSON.parse(s); S.pending = null; $('#undo').disabled = !S.undo.length;
  if (S.walk && !S.house.floors[S.walk.floor]) leave();
  if (S.floor !== null && !S.house.floors[S.floor]) S.floor = null;
  select(S.sel); save(true);
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'; view.theme();
  let saved; try { saved = localStorage.husformMood; } catch {}
  if (!saved) setMood(e.matches ? 'evening' : 'day');
});
matchMedia('(min-width: 760px)').addEventListener('change', ui);

checkServer();
db('readonly', s => s.get('house')).catch(() => null).then(saved => {
  let unsaved; try { unsaved = JSON.parse(localStorage.husformUnsaved); } catch {}
  try { if ((unsaved || saved)?.version === 1) S.house = normalize(unsaved || saved); } catch {}
  if (unsaved) save(true);
  view.build(S.house, { floor: null }); view.frame(false, { intro: true }); ui(); window.husformReady = true;
});
