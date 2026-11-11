const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c); return e; };
const icon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
const ELEMENTS = ['ytterdør', 'fasade', 'tak', 'vinduer', 'vegger', 'gulv', 'hage'];
const STYLES = ['Moderne funkis', 'Tradisjonelt trehus', 'Sveitserstil', 'Minimalistisk', 'Hytte i tre', 'Murhus'];
const KINDS = ['Ute', 'Inne', 'Tomt'];
const S = { images: [], sel: null, tab: 'edit', busy: false, element: ELEMENTS[0], n: 0, wishes: JSON.parse(localStorage.wishes || '[]') };
const cur = () => S.images.find(i => i.id === S.sel);

const say = (msg = '', error = false) => { $('#status').textContent = msg; $('#status').className = error ? 'error' : ''; };
const vname = (ver, i) => i ? `${i}. ${ver.note}` : ver.note;
const before = im => im.versions[im.cmp ?? im.at - 1];
const show = (im, i) => { im.at = i; im.cmp = null; render(); };

async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await Provider.load(url), k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) }), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .9);
  } finally { URL.revokeObjectURL(url); }
}
const save = (href, im, suffix = '') => h('a', { href, download: `${(im.name || 'hus').replace(/[^\wæøå]+/gi, '-')}${suffix}.jpg` }).click();
async function saveBoth() {
  const im = cur();
  try {
    const imgs = await Promise.all([before(im), im.versions[im.at]].map(v => Provider.load(v.src)));
    const H = Math.min(1200, ...imgs.map(i => i.height)), ws = imgs.map(i => Math.round(i.width * H / i.height)), p = H / 50;
    const c = h('canvas', { width: ws[0] + ws[1] + p, height: H }), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, H); x.font = `600 ${p * 2}px sans-serif`; x.textBaseline = 'top';
    imgs.forEach((img, i) => {
      const l = i * (ws[0] + p), t = i ? 'Etter' : 'Før';
      x.drawImage(img, l, 0, ws[i], H);
      x.fillStyle = 'rgba(20,20,18,.72)'; x.fillRect(l + p, p, x.measureText(t).width + p * 2, p * 4);
      x.fillStyle = '#fff'; x.fillText(t, l + p * 2, p * 2);
    });
    save(c.toDataURL('image/jpeg', .9), im, '-for-etter');
  } catch { say('Kunne ikke lage før/etter-bildet.', true); }
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
    const name = h('input', { value: im.name, maxLength: 60, ariaLabel: 'Etikett', oninput: e => { im.name = e.target.value; renderRefs(); }, onfocus: () => S.sel !== im.id && (S.sel = im.id, renderStage(), mark()) });
    const kind = h('select', { ariaLabel: 'Type bilde', onchange: e => im.kind = e.target.value }, ...KINDS.map(k => h('option', { selected: k === im.kind }, k)));
    const del = h('button', { type: 'button', className: 'icon', ariaLabel: `Fjern ${im.name || 'bilde'}`, onclick: () => { S.images = S.images.filter(i => i !== im); if (S.sel === im.id) S.sel = S.images[0]?.id ?? null; render(); } }, icon('M6 6l12 12M18 6 6 18'));
    const li = h('li', {}, h('button', { type: 'button', className: 'thumb', ariaLabel: `Vis ${im.name || 'bilde'}`, onclick: pick }, h('img', { src: im.versions[im.at].src, alt: '' })), name, del, kind);
    li.dataset.id = im.id;
    return li;
  }));
  mark();
}
const mark = () => document.querySelectorAll('#list li').forEach(li => li.setAttribute('aria-current', li.dataset.id == S.sel));

function renderStage() {
  const im = cur(), stage = $('#stage');
  stage.classList.toggle('busy', S.busy);
  const prev = im && before(im);
  $('#undo').disabled = !im || im.at === 0 || S.busy;
  $('#dl').disabled = !im; $('#dl2').disabled = !prev; $('#cmp').disabled = !im || im.versions.length < 2;
  $('#cmp').replaceChildren(h('option', { value: -1 }, 'Ingen'), ...(im ? im.versions : []).map((ver, i) => h('option', { value: i, selected: ver === prev, hidden: i === im.at, disabled: i === im.at }, vname(ver, i))));
  if (!im) {
    stage.replaceChildren(h('p', { className: 'empty' }, h('b', {}, S.tab === 'edit' ? 'Start med et bilde av huset' : 'Beskriv huset du vil ha'),
      S.tab === 'edit' ? 'Slipp ett eller flere bilder hvor som helst i vinduet. Velg så hva som skal endres, og til hva.' : 'Velg stil og skriv en beskrivelse til høyre. Bilder du laster opp, følger med som referanse.'));
    return $('#versions').replaceChildren();
  }
  const v = im.versions[im.at];
  const box = h('div', { className: 'compare' }, h('img', { src: v.src, alt: `${im.name}, ${v.note}`, draggable: false }));
  if (prev) box.append(h('img', { className: 'before', src: prev.src, alt: '', draggable: false }), h('i'), h('span', {}, 'Før'), h('span', {}, 'Etter'),
    h('input', { type: 'range', min: 0, max: 100, value: 50, ariaLabel: 'Sammenlign før og etter', oninput: e => box.style.setProperty('--p', e.target.value + '%') }));
  stage.replaceChildren(box);
  $('#versions').replaceChildren(...im.versions.map((ver, i) => h('li', {}, h('button', { type: 'button', title: ver.note, ariaCurrent: i === im.at, onclick: () => show(im, i) },
    h('img', { src: ver.src, alt: '' }), h('span', {}, vname(ver, i))))));
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
  $('#keep').disabled = !wish || S.wishes.includes(wish);
}
function setWishes(list) {
  if (list) localStorage.wishes = JSON.stringify(S.wishes = list);
  $('#wishes').replaceChildren(...S.wishes.map(w => h('span', {},
    h('button', { type: 'button', title: w, onclick: () => { $('#wish').value = w; renderPrompts(); } }, w),
    h('button', { type: 'button', ariaLabel: `Fjern ønsket ${w}`, onclick: () => setWishes(S.wishes.filter(o => o !== w)) }, icon('M6 6l12 12M18 6 6 18')))));
  renderPrompts();
}
function render() { renderList(); renderStage(); renderRefs(); renderPrompts(); }

async function run(mode) {
  if (S.busy) return;
  const im = cur(), field = mode === 'edit' ? $('#wish') : $('#desc');
  if (!field.value.trim()) { say(mode === 'edit' ? 'Skriv hva elementet skal endres til.' : 'Skriv en kort beskrivelse av huset.', true); return field.focus(); }
  const prompt = $(`#prompt-${mode}`).textContent;
  const images = mode === 'edit' ? [im.versions[im.at].src] : S.images.map(i => i.versions[i.at].src);
  const note = mode === 'edit' ? `${S.element}: ${field.value.trim()}` : $('#style').value;
  S.busy = true; say(); render();
  try {
    const { image } = await Provider.generate({ mode, prompt, images });
    if (!image) throw new Error('svaret manglet bilde');
    if (mode === 'edit') {
      if (S.images.includes(im)) { im.versions.push({ src: image, note }); im.at = im.versions.length - 1; im.cmp = null; }
    } else {
      S.images.push({ id: ++S.n, name: `Nytt hus, ${note.toLowerCase()}`, kind: 'Ute', at: 0, versions: [{ src: image, note: 'Generert' }] });
      S.sel = S.n;
    }
    say(mode === 'edit' ? 'Ny versjon er klar. Dra i bildet for å sammenligne.' : 'Huset er lagt til i bildene dine.');
  } catch (e) {
    say(`Kunne ikke lage bildet: ${e.message || 'ukjent feil'}. Prøv igjen.`, true);
  } finally { S.busy = false; render(); }
}
const undo = () => { const im = cur(); if (im && im.at > 0 && !S.busy) show(im, im.at - 1); };

$('#elements').append(...ELEMENTS.map((el, i) => h('label', {}, h('input', { type: 'radio', name: 'el', value: el, checked: !i, onchange: () => { S.element = el; renderPrompts(); } }), el)));
$('#style').append(...STYLES.map(s => h('option', {}, s)));
['#wish', '#desc', '#style'].forEach(s => $(s).addEventListener('input', renderPrompts));
$('#panel-edit').onsubmit = e => { e.preventDefault(); run('edit'); };
$('#panel-create').onsubmit = e => { e.preventDefault(); run('create'); };
$('#undo').onclick = undo;
$('#dl').onclick = () => save(cur().versions[cur().at].src, cur());
$('#dl2').onclick = saveBoth;
$('#cmp').onchange = e => { cur().cmp = +e.target.value; renderStage(); };
$('#keep').onclick = () => setWishes([$('#wish').value.trim(), ...S.wishes].slice(0, 12));
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
const drag = on => document.body.classList.toggle('dragging', on);
addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { depth++; drag(true); } });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drag(false); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); depth = 0; drag(false); if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files); });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input, textarea')) { e.preventDefault(); undo(); } });
$('#demo').hidden = !Provider.demo;
render(); setWishes();
