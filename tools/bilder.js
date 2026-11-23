// Tar skjermbilder av demohuset fra faste kameravinkler, så et steg kan sammenlignes før og etter.
// Ikke en del av appen: skriptet starter en enkel filtjener for repoet, åpner appen i Playwright og lagrer bildene i
// tools/bilder/<dato>_<tid>[-navn]/. Se README («Skjermbilder») for hvordan det kjøres.
//
//   node tools/bilder.js [navn] [--lokal] [--url http://localhost:3000] [--skala 2] [--ut mappe] [--chromium sti]
//
// Vinklene regnes ut fra demohuset i js/house.js (rom, vinduer og dører finnes etter navn og plassering), så de følger
// med hvis demohuset endres. Appen eksponerer ikke kameraet, så skriptet bytter ut OrbitControls-modulen i nettverkslaget
// med en tynn innpakning som legger kontrollen på window. Appfilene røres ikke.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(TOOLS, '..');
const require = createRequire(import.meta.url);

// Argumenter
const argv = process.argv.slice(2), opt = { navn: '', lokal: false, url: '', skala: 2, ut: join(TOOLS, 'bilder'), chromium: process.env.CHROMIUM_PATH || '' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], val = () => { const v = argv[++i]; if (v === undefined) stop(`${a} trenger en verdi.`); return v; };
  if (a === '--lokal') opt.lokal = true;
  else if (a === '--url') opt.url = val().replace(/\/?$/, '/');
  else if (a === '--skala') opt.skala = Math.max(1, Math.min(3, +val() || 1));
  else if (a === '--ut') opt.ut = resolve(val());
  else if (a === '--chromium') opt.chromium = val();
  else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n')); process.exit(0); }
  else if (a.startsWith('-')) stop(`Ukjent valg: ${a}. Se node tools/bilder.js --help.`);
  else opt.navn = a.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '');
}
function stop(msg) { console.error(`\n${msg}`); process.exit(1); }

let chromium;
try { ({ chromium } = require('playwright')); }
catch { stop('Fant ikke Playwright. Kjør: npm install --prefix tools && npx --prefix tools playwright install chromium'); }

// Three.js: samme versjon som importmap-en i index.html. Blokkeres CDN-en, hentes filene fra npm-pakken i stedet.
const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@([^/]+)\/([^?#]*)(\?[^#]*)?/;
const WANT = readFileSync(join(ROOT, 'index.html'), 'utf8').match(/three@([\w.-]+)\//)?.[1];
const localThree = (() => {
  const dirs = [join(TOOLS, 'node_modules', 'three'), join(ROOT, 'node_modules', 'three')];
  try { dirs.push(dirname(require.resolve('three/package.json'))); } catch {}
  for (const d of dirs) {
    try { const { version } = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')); return { dir: d, version }; } catch {}
  }
  return null;
})();
const three = { source: opt.lokal ? 'lokal' : 'cdn', failed: '' };
if (opt.lokal && !localThree) stop('--lokal: fant ikke Three.js lokalt. Kjør: npm install --prefix tools');
if (localThree && WANT && localThree.version !== WANT) console.warn(`Advarsel: appen bruker three@${WANT}, men lokal kopi er three@${localThree.version}. Oppdater "three" i tools/package.json.`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };
// Innpakning rundt OrbitControls: samme klasse, men hver ny kontroll legges på window.__bilder (kontrollen og kameraet).
const WRAPPER = `import { OrbitControls as Ekte } from './OrbitControls.js?ekte';
export class OrbitControls extends Ekte { constructor(...a) { super(...a); window.__bilder = { controls: this }; } }\n`;

async function routeThree(route) {
  const [, , path, query] = route.request().url().match(CDN);
  if (path.endsWith('controls/OrbitControls.js') && query !== '?ekte') return route.fulfill({ contentType: TYPES['.js'], body: WRAPPER });
  if (three.source === 'cdn') {
    try { const r = await route.fetch({ timeout: 15000 }); if (r.ok()) return route.fulfill({ response: r }); throw new Error(`svarte ${r.status()}`); }
    catch (e) {
      if (!localThree) { three.failed = `Three.js kunne ikke hentes fra CDN (${e.message.split('\n')[0]}), og finnes ikke lokalt. Kjør: npm install --prefix tools`; return route.abort(); }
      if (three.source === 'cdn') console.log(`CDN-en svarte ikke (${e.message.split('\n')[0]}). Bruker Three.js fra ${relative(ROOT, localThree.dir)}.`);
      three.source = 'lokal';
    }
  }
  const file = normalize(join(localThree.dir, path));
  if (!file.startsWith(localThree.dir + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: 'finnes ikke lokalt' });
  return route.fulfill({ contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
}

// Enkel filtjener for repoet (bare lesing, bare 127.0.0.1, ingen skjulte filer som .env).
function serve() {
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (file === ROOT || path.endsWith('/')) file = join(file, 'index.html');
    const bad = !file.startsWith(ROOT + sep) || relative(ROOT, file).split(sep).some(p => p.startsWith('.') || p === 'node_modules');
    if (req.method !== 'GET' || bad || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('finnes ikke'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(file));
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

// Kameravinkler, regnet ut fra demohuset
const { DEMO } = await import(pathToFileURL(join(ROOT, 'js', 'house.js')).href);
const house = DEMO, floors = house.floors;
const base = floors.map((_, i) => floors.slice(0, i).reduce((s, f) => s + f.height, 0));
const eye = i => base[i] + Math.min(1.6, floors[i].height - .3);
const deg = Math.PI / 180;
function extent(fs) {
  const xs = [], zs = [];
  for (const f of fs) for (const w of f.walls) { xs.push(w.x1, w.x2); zs.push(w.z1, w.z2); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
// Kameraet utenfor: sikter mot midten av huset, i fast retning, så langt unna at hele huset får plass.
function orbit(upTo, steep, aspect) {
  const b = extent(floors.slice(0, upTo + 1)), r0 = house.roof && !steep ? house.roof : null, oh = r0 ? r0.overhang : 0;
  const span = Math.min(b.x1 - b.x0, b.z1 - b.z0), rise = r0 && r0.type !== 'flat' ? Math.tan(r0.pitch * deg) * span / 2 : 0;
  const top = base[upTo] + floors[upTo].height + rise, size = [b.x1 - b.x0 + 2 * oh, top, b.z1 - b.z0 + 2 * oh];
  const c = [(b.x0 + b.x1) / 2, top / 2, (b.z0 + b.z1) / 2], r = Math.hypot(...size) / 2;
  // Avstanden regnes ut fra den smaleste synsvinkelen (loddrett fov er 50°), så huset får plass også på høy, smal mobil.
  const half = Math.min(25 * deg, Math.atan(Math.tan(25 * deg) * aspect)), dist = r / Math.sin(half) * 1.05 * (steep ? 1.12 : 1);
  const d = steep ? [.12, 1, .25] : [.45, .75, .8], k = dist / Math.hypot(...d);
  return { target: c, pos: c.map((v, i) => v + d[i] * k) };
}
const find = re => { for (const [i, f] of floors.entries()) { const room = f.rooms.find(r => re.test(r.name)); if (room) return { room, i }; } return null; };
const center = r => [r.x + r.w / 2, r.z + r.d / 2];
// Åpninger som ligger i kanten av rommet: { o, p: [x, z], n: enhetsvektor inn i rommet, w: veggen }
function openings(room, i, type) {
  const out = [], [cx, cz] = center(room);
  for (const w of floors[i].walls) {
    const L = Math.hypot(w.x2 - w.x1, w.z2 - w.z1), ux = (w.x2 - w.x1) / L, uz = (w.z2 - w.z1) / L, t = w.thickness / 2 + .05;
    for (const o of w.openings) {
      if (o.type !== type) continue;
      const p = [w.x1 + ux * o.pos, w.z1 + uz * o.pos];
      const inBig = p[0] > room.x - t && p[0] < room.x + room.w + t && p[1] > room.z - t && p[1] < room.z + room.d + t;
      const inSmall = p[0] > room.x + t && p[0] < room.x + room.w - t && p[1] > room.z + t && p[1] < room.z + room.d - t;
      if (!inBig || inSmall) continue;
      let n = [-uz, ux]; if ((cx - p[0]) * n[0] + (cz - p[1]) * n[1] < 0) n = [uz, -ux];
      out.push({ o, p, n, w });
    }
  }
  return out;
}
// Hvor langt fra p i retning d før man er ute av rommet
function exit(room, p, d) {
  const ts = [];
  if (d[0] > 1e-6) ts.push((room.x + room.w - p[0]) / d[0]); if (d[0] < -1e-6) ts.push((room.x - p[0]) / d[0]);
  if (d[1] > 1e-6) ts.push((room.z + room.d - p[1]) / d[1]); if (d[1] < -1e-6) ts.push((room.z - p[1]) / d[1]);
  return Math.max(0, Math.min(...ts));
}
// Øyehøyde i p, blikket mot punktet t = [x, y, z]
function look(i, p, t) {
  const y = eye(i), dx = t[0] - p[0], dz = t[2] - p[1];
  return { pos: [p[0], y, p[1]], yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(t[1] - y, Math.hypot(dx, dz)) };
}
const INSIDE = [
  ['stue-vindu', 'Stue mot vindu', () => {
    const s = find(/stue/i) || { room: [...floors[0].rooms].sort((a, b) => b.w * b.d - a.w * a.d)[0], i: 0 };
    const win = openings(s.room, s.i, 'window').sort((a, b) => b.o.width - a.o.width)[0];
    if (!win) return null;
    const back = Math.max(1, exit(s.room, win.p, win.n) - .5), p = [win.p[0] + win.n[0] * back, win.p[1] + win.n[1] * back];
    return look(s.i, p, [win.p[0], base[s.i] + win.o.sill + win.o.height / 2, win.p[1]]);
  }],
  ['stue-kjokken', 'Stue mot kjøkken', () => {
    const s = find(/stue/i), k = find(/kj(ø|o)kken/i);
    if (!s || !k || s.i !== k.i) return null;
    // Gjennom døren mellom rommene hvis det finnes en, ellers fra midten av stua mot midten av kjøkkenet.
    const kd = openings(k.room, k.i, 'door'), door = openings(s.room, s.i, 'door').find(d => kd.some(e => e.o === d.o));
    if (door) {
      const back = Math.max(1, exit(s.room, door.p, door.n) - .5);
      return look(s.i, [door.p[0] + door.n[0] * back, door.p[1] + door.n[1] * back], [door.p[0], base[s.i] + 1, door.p[1]]);
    }
    const sc = center(s.room), kc = center(k.room), L = Math.hypot(kc[0] - sc[0], kc[1] - sc[1]) || 1, d = [(sc[0] - kc[0]) / L, (sc[1] - kc[1]) / L];
    const back = Math.max(0, exit(s.room, sc, d) - .5);
    return look(s.i, [sc[0] + d[0] * back, sc[1] + d[1] * back], [kc[0], base[s.i] + 1, kc[1]]);
  }],
  ['soverom', 'Soverom', () => {
    const s = find(/soverom|sov/i); if (!s) return null;
    const r = s.room, door = openings(r, s.i, 'door')[0], corners = [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]];
    // Fra hjørnet nærmest døren, diagonalt mot det motsatte hjørnet.
    const k = door ? corners.reduce((b, c, j) => Math.hypot(c[0] - door.p[0], c[1] - door.p[1]) < Math.hypot(corners[b][0] - door.p[0], corners[b][1] - door.p[1]) ? j : b, 0) : 0;
    const [cx, cz] = center(r), inset = c => [c[0] + Math.sign(cx - c[0]) * .45, c[1] + Math.sign(cz - c[1]) * .45];
    const a = inset(corners[k]), b = inset(corners[(k + 2) % 4]);
    return look(s.i, a, [b[0], base[s.i] + .9, b[1]]);
  }],
];

// Hjelpere i siden
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
async function setOrbit(page, v) {
  await page.evaluate(({ pos, target }) => {
    const c = window.__bilder.controls; c.target.set(...target); c.object.position.set(...pos); c.update(); c.dispatchEvent({ type: 'change' });
  }, v);
  await frames(page);
}
// I interiørmodus setter appen kameraets retning hver gang den tegner. Her låses retningen til vinkelen vi vil ha.
async function setWalk(page, v) {
  await page.evaluate(({ pos, yaw, pitch }) => {
    const c = window.__bilder.controls, cam = c.object, set = Object.getPrototypeOf(cam.rotation).set;
    cam.rotation.set = function () { return set.call(this, pitch, yaw, 0, 'YXZ'); };
    cam.position.set(...pos); c.dispatchEvent({ type: 'change' });
  }, v);
  await frames(page);
}

async function open(browser, url, vp, scheme, log) {
  // Redusert bevegelse: kameraflyvningene (dronetur, «Gå inn») blir øyeblikkelige, så bildet ikke tas midt i en flyvning.
  const ctx = await browser.newContext({ ...vp.ctx, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block', deviceScaleFactor: opt.skala });
  await ctx.route(CDN, routeThree);
  const page = await ctx.newPage();
  page.on('pageerror', e => log.push(`${vp.name}: ${e.message}`));
  // Skrifter som ikke lastes (uten nett) og api/status (finnes bare med node server.js) er ikke feil i appen.
  page.on('console', m => { const where = m.location()?.url || ''; if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|\/api\/|ERR_TUNNEL|ERR_NAME|ERR_PROXY/.test(m.text() + where)) log.push(`${vp.name}: ${m.text()}${where ? ` (${where})` : ''}`); });
  await page.goto(url);
  const ok = await page.waitForFunction(() => window.husformReady || !document.getElementById('fatal')?.hidden, null, { timeout: 30000 }).then(() => page.evaluate(() => !!window.husformReady), () => false);
  if (!ok) {
    const msg = await page.locator('#fatal').textContent().catch(() => '');
    throw new Error(three.failed || `Appen startet ikke${msg?.trim() ? `: ${msg.trim()}` : ' innen 30 sekunder.'}`);
  }
  if (!(await page.evaluate(() => !!window.__bilder))) throw new Error('Fant ikke kamerakontrollen (OrbitControls ble ikke lastet via innpakningen).');
  // Himmelkartet lastes etter at appen har startet. Vent på det (eller på en feil), ellers fotograferes reservehimmelen.
  await page.waitForFunction(() => { const d = document.getElementById('view')?.dataset || {}; return !('sky' in d) || d.sky === 'hdri' || d.skyError; }, null, { timeout: 30000 }).catch(() => {});
  const skyError = await page.evaluate(() => document.getElementById('view')?.dataset.skyError);
  if (skyError) log.push(`${vp.name}: himmelkartet ble ikke lastet (${skyError})`);
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  return { page, ctx };
}

const VIEWPORTS = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } } },
  { name: 'mobil', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
];

// Mappen: tools/bilder/2026-11-22_1630[-navn]
const now = new Date(), pad = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
const earlier = existsSync(opt.ut) ? readdirSync(opt.ut).filter(d => /^\d{4}-\d\d-\d\d_\d{4}/.test(d)).sort() : [];
let dir = join(opt.ut, stamp + (opt.navn ? `-${opt.navn}` : ''));
for (let n = 2; existsSync(dir); n++) dir = join(opt.ut, `${stamp}${opt.navn ? `-${opt.navn}` : ''}-${n}`);

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const srv = opt.url ? null : await serve(), url = opt.url || `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch(opt.chromium ? { executablePath: opt.chromium } : {}).catch(e => {
  srv?.close();
  stop(`Fikk ikke startet Chromium: ${e.message.split('\n')[0]}\nKjør: npx --prefix tools playwright install chromium (eller pek på en Chrome/Chromium med --chromium <sti>).`);
});
mkdirSync(dir, { recursive: true });
const shots = [], log = [], skipped = new Set();
const t0 = Date.now();
try {
  for (const vp of VIEWPORTS) {
    const { width, height } = vp.ctx.viewport, aspect = width / height;
    const shot = async (page, key, label) => {
      const file = `${key}-${vp.name}.png`;
      await page.screenshot({ path: join(dir, file) });
      shots.push({ fil: file, vinkel: label, visning: vp.name }); process.stdout.write(`  ${file}\n`);
    };
    console.log(`${vp.name} (${width}×${height}):`);
    // Dag (lyst tema): hele huset, hver etasje uten tak, og vinklene inne
    let { page, ctx } = await open(browser, url, vp, 'light', log);
    await setOrbit(page, orbit(floors.length - 1, false, aspect)); await shot(page, 'hus-dag', 'Hele huset, dag');
    for (const [i, f] of floors.entries()) {
      await page.locator('#floors button').nth(i + 1).click();
      await setOrbit(page, orbit(i, true, aspect)); await shot(page, `etasje-${i + 1}`, `Etasjevisning: ${f.name}`);
    }
    await page.locator('#b-walk').click(); await frames(page); // la appen lande inne før vinkelen settes
    for (const [key, label, calc] of INSIDE) {
      const v = calc(); if (!v) { skipped.add(`${label}: fant ikke rommet eller åpningen i demohuset`); continue; }
      await setWalk(page, v); await shot(page, key, label);
    }
    await ctx.close();
    // Kveld (mørkt tema): hele huset
    ({ page, ctx } = await open(browser, url, vp, 'dark', log));
    await setOrbit(page, orbit(floors.length - 1, false, aspect)); await shot(page, 'hus-kveld', 'Hele huset, kveld (mørkt tema)');
    await ctx.close();
  }
} catch (e) {
  await browser.close(); srv?.close();
  if (!shots.length) rmSync(dir, { recursive: true, force: true });
  stop(`Stoppet: ${e.message}${log.length && !three.failed ? `\n\nFeil i siden:\n${log.join("\n")}` : ""}`);
}
await browser.close(); srv?.close();

const status = git('status', '--porcelain', '--', '.', ':!tools');
writeFileSync(join(dir, 'info.json'), JSON.stringify({
  tid: now.toISOString(), navn: opt.navn || null, commit: git('rev-parse', '--short', 'HEAD') || null, gren: git('rev-parse', '--abbrev-ref', 'HEAD') || null,
  uncommitted: status ? status.split('\n') : [], app: opt.url || 'innebygd filtjener', three: { versjon: WANT, kilde: three.source }, skala: opt.skala,
  bilder: shots, hoppetOver: [...skipped], feilISiden: log,
}, null, 2) + '\n');

const rel = p => relative(process.cwd(), p) || '.';
console.log(`\n${shots.length} bilder på ${((Date.now() - t0) / 1000).toFixed(0)} s i ${rel(dir)} (Three.js fra ${three.source === 'cdn' ? 'CDN' : 'lokal npm-pakke'}).`);
if (skipped.size) console.log(`Hoppet over:\n  ${[...skipped].join('\n  ')}`);
if (log.length) console.log(`Feil i siden:\n  ${log.join('\n  ')}`);
if (earlier.length) console.log(`Forrige kjøring til sammenligning: ${rel(join(opt.ut, earlier.at(-1)))}`);
