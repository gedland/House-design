const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c); return e; };
const icon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
const ELEMENTS = ['ytterdør', 'fasade', 'tak', 'vinduer', 'vegger', 'gulv', 'hage'];
const STYLES = ['Moderne funkis', 'Tradisjonelt trehus', 'Sveitserstil', 'Minimalistisk', 'Hytte i tre', 'Murhus'];
const KINDS = ['Ute', 'Inne', 'Tomt'];
const TONE = { ytterdør: '#5a3b26', fasade: '#d8d2c4', tak: '#3a3a3c', vinduer: '#2b2f33', vegger: '#e9e4d8', gulv: '#b08a5e', hage: '#5f8a4a' };
const COLORS = { tegl: '#a5553c', antrasitt: '#3b3f44', koks: '#3b3f44', hvit: '#f2efe8', svart: '#222224', sort: '#222224', grå: '#8a8c8e', rød: '#9c2f2a', blå: '#35557a', grønn: '#4f6f52', gul: '#d9b44a', brun: '#6b4a33', beige: '#d6c7a9', eik: '#a67c52', furu: '#d2a56d', oransje: '#c9742e', rosa: '#d9a3a8' };
const S = { images: [], sel: null, tab: 'edit', busy: false, element: ELEMENTS[0], n: 0, tool: 'brush', size: 5, manual: false };
// Fargen i forhåndsvisningen: fargeord i ønsket, ellers en standard for elementet. Egen fargevelger vinner.
function guessColor() {
  if (S.manual) return;
  const t = $('#wish').value.toLowerCase(), k = Object.keys(COLORS).find(k => t.includes(k));
  let c = k ? COLORS[k] : TONE[S.element];
  const f = !k ? 1 : /mørk/.test(t) ? .6 : /lys/.test(t) ? 1.25 : 1;
  if (f !== 1) c = '#' + [1, 3, 5].map(i => Math.min(255, Math.round(f > 1 ? 255 - (255 - parseInt(c.slice(i, i + 2), 16)) / f : parseInt(c.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('');
  $('#color').value = c;
}
const DB = new Promise((ok, no) => { const r = indexedDB.open('husform', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const db = (mode, fn) => DB.then(d => new Promise((ok, no) => { const q = fn(d.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); })).catch(() => null);
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => db('readwrite', s => s.put({ images: S.images.map(({ mask, ...i }) => i), sel: S.sel, n: S.n }, 'state')), 300); };
const painted = c => { if (!c) return false; const t = h('canvas', { width: 48, height: 48 }), x = t.getContext('2d'); x.drawImage(c, 0, 0, 48, 48); return x.getImageData(0, 0, 48, 48).data.some((v, i) => i % 4 === 3 && v > 8); };
function maskCanvas(im, pic) {
  const w = pic.naturalWidth, hh = pic.naturalHeight;
  if (!im.mask || im.mask.width !== w || im.mask.height !== hh) im.mask = h('canvas', { width: w, height: hh, className: 'mask' });
  const c = im.mask, x = c.getContext('2d'); let last = null;
  const stroke = e => {
    const r = c.getBoundingClientRect(), p = [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * hh / r.height];
    x.globalCompositeOperation = S.tool === 'erase' ? 'destination-out' : 'source-over';
    x.strokeStyle = '#ff2d78'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = w * S.size / 100;
    x.beginPath(); x.moveTo(...(last || [p[0] - .01, p[1]])); x.lineTo(...p); x.stroke(); last = p;
  };
  c.onpointerdown = e => { e.preventDefault(); c.setPointerCapture(e.pointerId); last = null; stroke(e); };
  c.onpointermove = e => last && stroke(e);
  c.onpointerup = c.onpointercancel = () => last = null;
  return c;
}
const cur = () => S.images.find(i => i.id === S.sel);

const say = (msg = '', error = false) => { $('#status').textContent = msg; $('#status').className = error ? 'error' : ''; };
const editPrompt = () => `Behold form, vinkel og lys.\nEndre kun ${S.element}.\nTil ${$('#wish').value.trim()}.\nIkke endre annet.`;
const createPrompt = () => `Lag et nytt hus.\nStil: ${$('#style').value}.\nBeskrivelse: ${$('#desc').value.trim()}.` + (S.images.length ? '\nBruk referansebildene for tomt, omgivelser og uttrykk.' : '');

function readImage(file) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) }), x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(); };
    img.src = url;
  });
}
async function addFiles(files) {
  const all = [...files], bad = [];
  for (const f of all) {
    try {
      if (!f.type.startsWith('image/')) throw 0;
      const src = await readImage(f), name = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
      const kind = /inne|stue|kjøkken|bad|interi/i.test(name) ? 'Inne' : /tomt|plot/i.test(name) ? 'Tomt' : 'Ute';
      S.images.push({ id: ++S.n, name, kind, at: 0, versions: [{ src, note: 'Original' }] });
      S.sel ??= S.n;
    } catch { bad.push(f.name); }
  }
  say(bad.length ? `Kunne ikke lese ${bad.length} av ${all.length} filer. Bruk JPG, PNG eller WebP.` : '', true);
  render();
}

function renderList() {
  $('#list').replaceChildren(...S.images.map(im => {
    const pick = () => { S.sel = im.id; render(); };
    const name = h('input', { value: im.name, maxLength: 60, ariaLabel: 'Etikett', oninput: e => { im.name = e.target.value; renderRefs(); save(); }, onfocus: () => S.sel !== im.id && (S.sel = im.id, renderStage(), mark()) });
    const kind = h('select', { ariaLabel: 'Type bilde', onchange: e => { im.kind = e.target.value; save(); } }, ...KINDS.map(k => h('option', { selected: k === im.kind }, k)));
    const del = h('button', { type: 'button', className: 'icon', ariaLabel: `Fjern ${im.name || 'bilde'}`, onclick: () => { S.images = S.images.filter(i => i !== im); if (S.sel === im.id) S.sel = S.images[0]?.id ?? null; render(); } }, icon('M6 6l12 12M18 6 6 18'));
    const li = h('li', {}, h('button', { type: 'button', className: 'thumb', ariaLabel: `Vis ${im.name || 'bilde'}`, onclick: pick }, h('img', { src: im.versions[im.at].src, alt: '' })), name, del, kind);
    li.dataset.id = im.id;
    return li;
  }));
  $('#wipe').disabled = !S.images.length;
  mark();
}
const mark = () => document.querySelectorAll('#list li').forEach(li => li.setAttribute('aria-current', li.dataset.id == S.sel));

function renderStage() {
  const im = cur(), stage = $('#stage'), paint = S.tab === 'edit' && S.tool;
  stage.classList.toggle('busy', S.busy);
  $('#tools').hidden = S.tab !== 'edit' || !im;
  document.querySelectorAll('#tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === S.tool));
  $('#undo').disabled = !im || im.at === 0 || S.busy;
  if (!im) {
    stage.replaceChildren(h('p', { className: 'empty' }, h('b', {}, S.tab === 'edit' ? 'Start med et bilde av huset' : 'Beskriv huset du vil ha'),
      S.tab === 'edit' ? 'Slipp ett eller flere bilder hvor som helst i vinduet. Velg så hva som skal endres, og til hva.' : 'Velg stil og skriv en beskrivelse til høyre. Bilder du laster opp, følger med som referanse.'));
    return $('#versions').replaceChildren();
  }
  const v = im.versions[im.at], prev = im.versions[im.at - 1];
  const pic = h('img', { alt: `${im.name}, ${v.note}`, draggable: false }), box = h('div', { className: 'compare' }, pic);
  if (paint) pic.onload = () => box.append(maskCanvas(im, pic));
  pic.src = v.src;
  if (prev && !paint) box.append(h('img', { className: 'before', src: prev.src, alt: '', draggable: false }), h('i'), h('span', {}, 'Før'), h('span', {}, 'Etter'),
    h('input', { type: 'range', min: 0, max: 100, value: 50, ariaLabel: 'Sammenlign før og etter', oninput: e => box.style.setProperty('--p', e.target.value + '%') }));
  stage.replaceChildren(box);
  $('#versions').replaceChildren(...im.versions.map((ver, i) => h('li', {}, h('button', { type: 'button', title: ver.note, ariaCurrent: i === im.at, onclick: () => { im.at = i; render(); } },
    h('img', { src: ver.src, alt: '' }), h('span', {}, i ? `${i}. ${ver.note}` : ver.note)))));
  $('#versions [aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderRefs() {
  const n = S.images.length;
  $('#refs').textContent = n ? `${n} ${n === 1 ? 'bilde følger' : 'bilder følger'} med som referanse: ${S.images.map(i => `${i.name || 'uten navn'} (${i.kind.toLowerCase()})`).join(', ')}.` : 'Ingen referansebilder. Last opp bilder av tomt eller hus du liker for et mer treffsikkert resultat.';
}
function renderPrompts() {
  const m = t => h('mark', {}, t), wish = $('#wish').value.trim(), desc = $('#desc').value.trim();
  $('#prompt-edit').replaceChildren('Behold form, vinkel og lys.\nEndre kun ', m(S.element), '.\nTil ', m(wish || '…'), '.\nIkke endre annet.');
  $('#prompt-create').replaceChildren('Lag et nytt hus.\nStil: ', m($('#style').value), '.\nBeskrivelse: ', m(desc || '…'), '.', S.images.length ? '\nBruk referansebildene for tomt, omgivelser og uttrykk.' : '');
  $('#panel-edit .primary').disabled = S.busy || !cur();
  $('#panel-create .primary').disabled = S.busy;
}
function render() { renderList(); renderStage(); renderRefs(); renderPrompts(); save(); }

async function run(mode) {
  if (S.busy) return;
  const im = cur(), field = mode === 'edit' ? $('#wish') : $('#desc');
  if (!field.value.trim()) { say(mode === 'edit' ? 'Skriv hva elementet skal endres til.' : 'Skriv en kort beskrivelse av huset.', true); return field.focus(); }
  const prompt = mode === 'edit' ? editPrompt() : createPrompt();
  const images = mode === 'edit' ? [im.versions[im.at].src] : S.images.map(i => i.versions[i.at].src);
  const note = mode === 'edit' ? `${S.element}: ${field.value.trim()}` : $('#style').value;
  const mask = mode === 'edit' && painted(im.mask) ? im.mask : null;
  S.busy = true; say(); render();
  try {
    const { image, preview, warning } = await Provider.generate({ mode, prompt, images, mask, element: S.element, color: $('#color').value });
    if (!image) throw new Error('svaret manglet bilde');
    if (mode === 'edit') {
      if (S.images.includes(im)) { im.versions.push({ src: image, note }); im.at = im.versions.length - 1; S.tool = null; }
    } else {
      S.images.push({ id: ++S.n, name: `Nytt hus, ${note.toLowerCase()}`, kind: 'Ute', at: 0, versions: [{ src: image, note: 'Generert' }] });
      S.sel = S.n;
    }
    const ok = (preview ? 'Forhåndsvisning uten AI: ' : '') + (mode === 'edit' ? 'Ny versjon er klar. Dra i bildet for å sammenligne.' : 'Huset er lagt til i bildene dine.');
    say(warning ? `${warning} ${ok}` : ok, !!warning);
  } catch (e) {
    say(e.message || 'Kunne ikke lage bildet. Prøv igjen.', true);
  } finally { S.busy = false; render(); }
}
const undo = () => { const im = cur(); if (im && im.at > 0 && !S.busy) { im.at--; render(); } };

$('#elements').append(...ELEMENTS.map((el, i) => h('label', {}, h('input', { type: 'radio', name: 'el', value: el, checked: !i, onchange: () => { S.element = el; guessColor(); renderPrompts(); } }), el)));
$('#style').append(...STYLES.map(s => h('option', {}, s)));
['#wish', '#desc', '#style'].forEach(s => $(s).addEventListener('input', renderPrompts));
$('#panel-edit').onsubmit = e => { e.preventDefault(); run('edit'); };
$('#panel-create').onsubmit = e => { e.preventDefault(); run('create'); };
$('#undo').onclick = undo;
$('#wish').addEventListener('input', guessColor);
$('#color').oninput = () => S.manual = true;
$('#size').oninput = e => S.size = +e.target.value;
document.querySelectorAll('#tools [data-tool]').forEach(b => b.onclick = () => { S.tool = S.tool === b.dataset.tool ? null : b.dataset.tool; renderStage(); });
$('#clear').onclick = () => { const m = cur()?.mask; m?.getContext('2d').clearRect(0, 0, m.width, m.height); };
$('#wipe').onclick = async () => {
  if (!confirm('Slette alle bilder og versjoner? Dette kan ikke angres.')) return;
  S.images = []; S.sel = null; await db('readwrite', s => s.clear()); say('Alt er slettet.'); render();
};
$('#file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
document.querySelectorAll('[role=tab]').forEach(t => t.onclick = () => {
  S.tab = t.id.slice(4); say();
  document.querySelectorAll('[role=tab]').forEach(o => o.setAttribute('aria-selected', o === t));
  $('#panel-edit').hidden = S.tab !== 'edit'; $('#panel-create').hidden = S.tab !== 'create';
  render();
});
const setTheme = t => { document.documentElement.dataset.theme = t; $('#theme').ariaLabel = t === 'dark' ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'; };
$('#theme').onclick = () => setTheme(localStorage.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(document.documentElement.dataset.theme);
let depth = 0;
const drag = on => document.body.classList.toggle('dragging', on) || $('#stage').classList.toggle('dragging', on);
addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { depth++; drag(true); } });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drag(false); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); depth = 0; drag(false); if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files); });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input, textarea')) { e.preventDefault(); undo(); } });
Provider.status().then(s => {
  const d = $('#demo'); d.hidden = false; d.classList.toggle('preview', s.demo);
  d.textContent = s.demo ? 'Forhåndsvisning – ikke AI' : `AI: ${s.provider}`;
  $('#mode').textContent = s.demo ? 'Gratis forhåndsvisning: fargen legges på det markerte området i nettleseren. Dette er ikke AI. Ekte generering krever nøkkel, se README.' : `Ekte generering med ${s.provider}. Hvert bilde kan koste penger.`;
});
db('readonly', s => s.get('state')).then(st => { if (st) Object.assign(S, st); render(); });
