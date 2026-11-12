import { DEMO, MATERIALS, FURNITURE, find, round, wallLength, setWallLength, reshapeRoom } from './house.js';
import { createView } from './scene.js';

const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c.filter(x => x != null)); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const S = { house: clone(DEMO), sel: null, undo: [], pending: null, move: false };
const view = createView($('#view'));

// Lagring i IndexedDB
const DB = new Promise((ok, no) => { const r = indexedDB.open('husform', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const db = (mode, fn) => DB.then(d => new Promise((ok, no) => { const q = fn(d.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); })).catch(() => null);
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => db('readwrite', s => s.put(S.house, 'house')), 300); };

// Alle endringer går gjennom edit(): JSON endres, 3D tegnes på nytt. commit() lagrer og legger et angre-steg.
let drawT = 0;
function draw() { if (drawT) return; drawT = requestAnimationFrame(() => { drawT = 0; view.build(S.house); view.select(S.sel); }); }
function edit(fn, done = true) { S.pending ??= JSON.stringify(S.house); fn(); draw(); if (done) commit(); }
function commit() {
  if (S.pending && S.pending !== JSON.stringify(S.house)) { S.undo.push(S.pending); if (S.undo.length > 50) S.undo.shift(); save(); }
  S.pending = null; $('#undo').disabled = !S.undo.length;
}
function load(house, keepUndo) { S.house = house; S.sel = null; S.move = false; if (!keepUndo) S.undo = []; S.pending = null; $('#undo').disabled = !S.undo.length; draw(); panel(); }
function select(id) { if (id !== S.sel) S.move = false; S.sel = id && find(S.house, id) ? id : null; draw(); panel(); }

// Panelet: feltene for det valgte objektet
const num = (key, label, min = 0, step = .05) => ({ key, label, type: 'number', min, step });
const opts = o => Object.entries(o).map(([v, x]) => [v, x.label || x]);
const FIELDS = {
  room: [{ key: 'name', label: 'Navn', type: 'text', wide: true }, num('w', 'Bredde (m)', .5), num('d', 'Dybde (m)', .5), num('height', 'Takhøyde (m)', 1.8),
    { key: 'material', label: 'Gulv', type: 'select', options: opts(MATERIALS) }, { key: 'color', label: 'Gulvfarge', type: 'color' }, num('x', 'Plassering X (m)', -99), num('z', 'Plassering Z (m)', -99)],
  wall: [{ key: 'color', label: 'Farge', type: 'color' }, { key: 'material', label: 'Materiale', type: 'select', options: opts(MATERIALS) }, num('length', 'Lengde (m)', .2), num('thickness', 'Tykkelse (m)', .05, .01)],
  opening: [{ key: 'type', label: 'Type', type: 'select', options: [['door', 'Dør'], ['window', 'Vindu']] }, { key: 'color', label: 'Farge', type: 'color' }, num('width', 'Bredde (m)', .3), num('height', 'Høyde (m)', .3),
    num('sill', 'Høyde over gulv (m)'), num('pos', 'Avstand langs vegg (m)')],
  furniture: [{ key: 'type', label: 'Type', type: 'select', options: opts(FURNITURE) }, { key: 'color', label: 'Farge', type: 'color' }, { key: 'material', label: 'Materiale', type: 'select', options: opts(MATERIALS) },
    num('w', 'Bredde (m)', .1), num('d', 'Dybde (m)', .1), num('h', 'Høyde (m)', .1), num('rot', 'Rotasjon (°)', -360, 15), num('x', 'Plassering X (m)', -99), num('z', 'Plassering Z (m)', -99)],
};
const title = f => f.kind === 'room' ? f.item.name || 'Rom' : f.kind === 'wall' ? 'Vegg' : f.kind === 'opening' ? (f.item.type === 'door' ? 'Dør' : 'Vindu') : FURNITURE[f.item.type]?.label || 'Møbel';
const KIND = { room: 'Rom', wall: 'Vegg', opening: 'Åpning', furniture: 'Møbel' };
function getValue(f, key) {
  if (f.kind === 'wall' && key === 'length') return round(wallLength(f.item));
  if (f.kind === 'room' && key === 'height') return f.floor.height;
  return f.item[key];
}
function setValue(f, key, v) {
  if (f.kind === 'wall' && key === 'length') setWallLength(f.item, v);
  else if (f.kind === 'room' && key === 'height') f.floor.height = v;
  else if (f.kind === 'room' && 'xzwd'.includes(key)) reshapeRoom(f.floor, f.item, { [key]: v });
  else f.item[key] = v;
}
function panel() {
  const el = $('#panel'), f = S.sel && find(S.house, S.sel);
  document.body.classList.toggle('has-sel', !!f); document.body.classList.toggle('moving', !!f && S.move);
  if (!f) { el.replaceChildren(); return view.setInset(0, 0); }
  const fields = FIELDS[f.kind].map(d => {
    const v = getValue(f, d.key);
    const input = d.type === 'select'
      ? h('select', {}, ...d.options.map(([value, label]) => h('option', { value, textContent: label, selected: value === v })))
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
  el.replaceChildren(...[
    h('div', { className: 'head' }, h('div', {}, h('small', { textContent: KIND[f.kind] }), h('h2', { textContent: title(f) })),
      h('button', { type: 'button', className: 'icon', ariaLabel: 'Lukk', textContent: '✕', onclick: () => select(null) })),
    h('div', { className: 'acts' },
      h('button', { type: 'button', id: 'move', ariaPressed: String(S.move), textContent: S.move ? 'Ferdig flyttet' : 'Flytt', onclick: () => { S.move = !S.move; panel(); } }),
      h('button', { type: 'button', className: 'danger', textContent: 'Slett', onclick: remove })),
    S.move ? h('p', { className: 'hint', textContent: 'Dra i 3D-visningen for å flytte objektet.' }) : null,
    h('div', { className: 'fields' }, ...fields)].filter(Boolean));
  const wide = matchMedia('(min-width: 760px)').matches;
  view.setInset(wide ? el.offsetWidth + 10 : 0, wide ? 0 : el.offsetHeight);
}
function remove() {
  const f = find(S.house, S.sel); if (!f) return;
  edit(() => f.list.splice(f.list.indexOf(f.item), 1)); select(null);
}

// Pek og dra: trykk velger et objekt. Med «Flytt» på flytter dra det valgte objektet, ellers roterer dra kameraet.
const cv = $('#view'); let down = null;
cv.addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  const f = S.move && S.sel && find(S.house, S.sel), p = f && view.planePoint(e, f.y);
  if (p) { down.drag = { y: f.y, x: p.x, z: p.z, ax: 0, az: 0 }; view.controls.enabled = false; cv.setPointerCapture(e.pointerId); }
}, true);
cv.addEventListener('pointermove', e => {
  const g = down?.drag; if (!g || e.pointerId !== down.id) return;
  const p = view.planePoint(e, g.y), f = find(S.house, S.sel); if (!p || !f) return;
  const snap = v => Math.round(v * 20) / 20, tx = snap(p.x - g.x), tz = snap(p.z - g.z), dx = tx - g.ax, dz = tz - g.az, it = f.item;
  if (!dx && !dz) return;
  g.ax = tx; g.az = tz;
  edit(() => {
    if (f.kind === 'furniture') { it.x = round(it.x + dx); it.z = round(it.z + dz); }
    else if (f.kind === 'room') reshapeRoom(f.floor, it, { x: it.x + dx, z: it.z + dz });
    else if (f.kind === 'wall') { it.x1 = round(it.x1 + dx); it.x2 = round(it.x2 + dx); it.z1 = round(it.z1 + dz); it.z2 = round(it.z2 + dz); }
    else { const w = f.wall, L = wallLength(w) || 1; it.pos = round(Math.min(L, Math.max(0, it.pos + (dx * (w.x2 - w.x1) + dz * (w.z2 - w.z1)) / L))); }
  }, false);
  panel();
});
const up = e => {
  if (!down || e.pointerId !== down.id) return;
  const d = down; down = null;
  if (d.drag) { view.controls.enabled = true; commit(); }
  else if (e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) select(view.pick(e));
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

$('#undo').onclick = () => { const s = S.undo.pop(); if (!s) return; const keep = S.sel; load(JSON.parse(s), true); select(keep); save(); };
$('#reset').onclick = () => { if (!confirm('Bytte ut huset med demohuset? Endringene dine forsvinner.')) return; load(clone(DEMO)); view.frame(); save(); };
addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'Escape') select(null);
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) remove();
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#undo').click(); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'; view.theme(); });

db('readonly', s => s.get('house')).then(saved => {
  if (saved?.version === 1 && saved.floors?.length) S.house = saved;
  view.build(S.house); view.frame(); panel();
});
