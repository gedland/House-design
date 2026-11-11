const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c); return e; };
const icon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
const ELEMENTS = ['ytterdør', 'fasade', 'tak', 'vinduer', 'vegger', 'gulv', 'hage'];
const STYLES = ['Moderne funkis', 'Tradisjonelt trehus', 'Sveitserstil', 'Minimalistisk', 'Hytte i tre', 'Murhus'];
const KINDS = ['Ute', 'Inne', 'Tomt'];
const S = { images: [], sel: null, tab: 'edit', busy: false, element: ELEMENTS[0], n: 0 };
const cur = () => S.images.find(i => i.id === S.sel);
const cv = (width, height) => h('canvas', { width, height });
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bildet kunne ikke leses')); i.src = src; });
const MASKLINE = '\nEndre bare området som er markert i rødt i bilde 2. Ikke ta med markeringen.';

const DB = (() => {
  const open = new Promise((ok, no) => { const r = indexedDB.open('husform', 1); r.onupgradeneeded = () => r.result.createObjectStore('images', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = f => open.then(db => new Promise((ok, no) => { const t = db.transaction('images', 'readwrite'), q = f(t.objectStore('images')); t.oncomplete = () => ok(q?.result); t.onerror = t.onabort = () => no(t.error); }));
  return { load: () => tx(s => s.getAll()), save: list => tx(s => { s.clear(); list.forEach(i => s.put(i)); }) };
})();
let saveTimer;
const save = () => { if (!S.ready) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.save(S.images).catch(() => say('Kunne ikke lagre i nettleseren. Lageret kan være fullt.', true)), 250); };

const say = (msg = '', error = false) => { $('#status').textContent = msg; $('#status').className = error ? 'error' : ''; };
const editPrompt = () => `Behold form, vinkel og lys.\nEndre kun ${S.element}.\nTil ${$('#wish').value.trim()}.\nIkke endre annet.` + (S.inked ? MASKLINE : '');
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
    const name = h('input', { value: im.name, maxLength: 60, ariaLabel: 'Etikett', oninput: e => { im.name = e.target.value; renderRefs(); save(); }, onfocus: () => S.sel !== im.id && (S.sel = im.id, renderStage(), renderPrompts(), mark()) });
    const kind = h('select', { ariaLabel: 'Type bilde', onchange: e => { im.kind = e.target.value; save(); } }, ...KINDS.map(k => h('option', { selected: k === im.kind }, k)));
    const del = h('button', { type: 'button', className: 'icon', ariaLabel: `Fjern ${im.name || 'bilde'}`, onclick: () => { S.images = S.images.filter(i => i !== im); if (S.sel === im.id) S.sel = S.images[0]?.id ?? null; render(); } }, icon('M6 6l12 12M18 6 6 18'));
    const li = h('li', {}, h('button', { type: 'button', className: 'thumb', ariaLabel: `Vis ${im.name || 'bilde'}`, onclick: pick }, h('img', { src: im.versions[im.at].src, alt: '' })), name, del, kind);
    li.dataset.id = im.id;
    return li;
  }));
  mark();
}
const mark = () => document.querySelectorAll('#list li').forEach(li => li.setAttribute('aria-current', li.dataset.id == S.sel));

function maskCanvas(pic) {
  const c = S.mask ??= h('canvas', { className: 'mask' }), x = c.getContext('2d');
  const size = () => { if (c.width !== pic.naturalWidth || c.height !== pic.naturalHeight) { c.width = pic.naturalWidth; c.height = pic.naturalHeight; } };
  pic.complete && pic.naturalWidth ? size() : pic.onload = size;
  let last;
  const draw = e => {
    const r = c.getBoundingClientRect(), k = c.width / r.width, p = [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
    x.strokeStyle = '#ff3b30'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = $('#brush').value * k;
    x.beginPath(); x.moveTo(...(last || p)); x.lineTo(p[0] + .01, p[1]); x.stroke(); last = p;
    if (!S.inked) { S.inked = true; renderPrompts(); }
  };
  c.onpointerdown = e => { if (S.busy) return; c.setPointerCapture(e.pointerId); last = null; draw(e); };
  c.onpointermove = e => last && e.buttons && draw(e);
  c.onpointerup = c.onpointercancel = () => last = null;
  return c;
}
function renderStage() {
  const im = cur(), stage = $('#stage');
  stage.classList.toggle('busy', S.busy);
  $('#undo').disabled = !im || im.at === 0 || S.busy;
  if (!im) {
    stage.replaceChildren(h('p', { className: 'empty' }, h('b', {}, S.tab === 'edit' ? 'Start med et bilde av huset' : 'Beskriv huset du vil ha'),
      S.tab === 'edit' ? 'Slipp ett eller flere bilder hvor som helst i vinduet. Velg så hva som skal endres, og til hva.' : 'Velg stil og skriv en beskrivelse til høyre. Bilder du laster opp, følger med som referanse.'));
    return $('#versions').replaceChildren();
  }
  const v = im.versions[im.at], prev = im.versions[im.at - 1], key = im.id + ':' + im.at;
  if (S.mkey !== key) { S.mkey = key; S.mask = null; S.inked = false; }
  const pic = h('img', { src: v.src, alt: `${im.name}, ${v.note}`, draggable: false }), box = h('div', { className: 'compare' }, pic);
  if (S.masking && S.tab === 'edit') box.append(maskCanvas(pic));
  else if (prev) box.append(h('img', { className: 'before', src: prev.src, alt: '', draggable: false }), h('i'), h('span', {}, 'Før'), h('span', {}, 'Etter'),
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
  $('#prompt-edit').replaceChildren('Behold form, vinkel og lys.\nEndre kun ', m(S.element), '.\nTil ', m(wish || '…'), '.\nIkke endre annet.', S.inked ? MASKLINE : '');
  $('#prompt-create').replaceChildren('Lag et nytt hus.\nStil: ', m($('#style').value), '.\nBeskrivelse: ', m(desc || '…'), '.', S.images.length ? '\nBruk referansebildene for tomt, omgivelser og uttrykk.' : '');
  $('#panel-edit .primary').disabled = S.busy || !cur();
  $('#panel-create .primary').disabled = S.busy;
  $('#maskbtn').disabled = S.busy || !cur(); $('#maskbtn').ariaPressed = !!S.masking;
  $('#maskbtn').textContent = S.masking ? 'Ferdig markert' : S.inked ? 'Endre markering' : 'Marker område';
  $('#brush').disabled = !S.masking; $('#maskclear').disabled = S.busy || !S.inked;
  $('#wipe').hidden = !S.images.length; $('#demo').hidden = !Provider.demo;
}
function render() { renderList(); renderStage(); renderRefs(); renderPrompts(); save(); }

async function run(mode) {
  if (S.busy) return;
  const im = cur(), field = mode === 'edit' ? $('#wish') : $('#desc');
  if (!field.value.trim()) { say(mode === 'edit' ? 'Skriv hva elementet skal endres til.' : 'Skriv en kort beskrivelse av huset.', true); return field.focus(); }
  const prompt = mode === 'edit' ? editPrompt() : createPrompt();
  const images = mode === 'edit' ? [im.versions[im.at].src] : S.images.map(i => i.versions[i.at].src);
  const note = mode === 'edit' ? `${S.element}: ${field.value.trim()}` : $('#style').value;
  const m = mode === 'edit' && S.inked ? S.mask : null;
  S.busy = true; say(); render();
  try {
    let mask, base, w, ht;
    if (m) { // modellen får originalen, en kopi med rød markering, og selve masken (hvit = endres)
      base = await loadImg(images[0]); w = m.width; ht = m.height;
      const a = cv(w, ht), ax = a.getContext('2d'), b = cv(w, ht), bx = b.getContext('2d');
      ax.drawImage(base, 0, 0, w, ht); ax.globalAlpha = .55; ax.drawImage(m, 0, 0);
      bx.drawImage(m, 0, 0); bx.globalCompositeOperation = 'source-in'; bx.fillStyle = '#fff'; bx.fillRect(0, 0, w, ht);
      bx.globalCompositeOperation = 'destination-over'; bx.fillStyle = '#000'; bx.fillRect(0, 0, w, ht);
      images.push(a.toDataURL('image/jpeg', .9)); mask = b.toDataURL('image/png');
    }
    let { image, demo, why } = await Provider.generate({ mode, prompt, images, mask });
    if (!image) throw new Error('svaret manglet bilde');
    if (m) { // lim resultatet inn i originalen bare innenfor markeringen, med myk kant
      const out = await loadImg(image), t = cv(w, ht), tx = t.getContext('2d'), o = cv(w, ht), ox = o.getContext('2d');
      tx.filter = `blur(${Math.max(2, Math.round(w / 200))}px)`; tx.drawImage(m, 0, 0); tx.filter = 'none';
      tx.globalCompositeOperation = 'source-in'; tx.drawImage(out, 0, 0, w, ht);
      ox.drawImage(base, 0, 0, w, ht); ox.drawImage(t, 0, 0);
      image = o.toDataURL('image/jpeg', .92); S.masking = false;
    }
    if (mode === 'edit') {
      if (S.images.includes(im)) { im.versions.push({ src: image, note }); im.at = im.versions.length - 1; }
    } else {
      S.images.push({ id: ++S.n, name: `Nytt hus, ${note.toLowerCase()}`, kind: 'Ute', at: 0, versions: [{ src: image, note: 'Generert' }] });
      S.sel = S.n;
    }
    say((demo ? `Demomodus (${why}): bildet er en plassholder. ` : '') + (mode === 'edit' ? 'Ny versjon er klar. Dra i bildet for å sammenligne.' : 'Huset er lagt til i bildene dine.'));
  } catch (e) {
    say(`Kunne ikke lage bildet: ${e.message || 'ukjent feil'}. Prøv igjen.`, true);
  } finally { S.busy = false; render(); }
}
const undo = () => { const im = cur(); if (im && im.at > 0 && !S.busy) { im.at--; render(); } };

$('#elements').append(...ELEMENTS.map((el, i) => h('label', {}, h('input', { type: 'radio', name: 'el', value: el, checked: !i, onchange: () => { S.element = el; renderPrompts(); } }), el)));
$('#style').append(...STYLES.map(s => h('option', {}, s)));
['#wish', '#desc', '#style'].forEach(s => $(s).addEventListener('input', renderPrompts));
$('#panel-edit').onsubmit = e => { e.preventDefault(); run('edit'); };
$('#panel-create').onsubmit = e => { e.preventDefault(); run('create'); };
$('#undo').onclick = undo;
$('#maskbtn').onclick = () => { S.masking = !S.masking; render(); };
$('#maskclear').onclick = () => { S.mask = null; S.inked = false; render(); };
$('#wipe').onclick = () => { if (!S.busy && confirm('Slette alle bilder og versjoner? Dette kan ikke angres.')) { S.images = []; S.sel = null; S.masking = false; say('Alt er slettet.'); render(); } };
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
render();
Provider.check().then(renderPrompts);
DB.load().then(list => { S.images = list.concat(S.images); S.n = Math.max(S.n, ...list.map(i => i.id)); S.sel ??= S.images[0]?.id ?? null; },
  () => say('Lagring i nettleseren er ikke tilgjengelig. Bildene forsvinner når siden lukkes.', true)).finally(() => { S.ready = true; render(); });
