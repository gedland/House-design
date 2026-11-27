// Lager bildene til eval-husene: tegner hver eval/hus/<id>/fasit.json med appens egen 3D-scene og tar «bilder» av den
// utenfra (fire fasader og to skrå) og innenfra (de største rommene). Bildene havner i eval/hus/<id>/bilder/.
// Hus med ekte bilder (en mappe bilder/ uten filen bilder/.tegnet) røres ikke.
//
//   node eval/tegn.mjs [hus ...]
//
// Krever Playwright med Chromium (npm i -D playwright && npx playwright install chromium).
// Three.js hentes fra cdn.jsdelivr.net som i appen, eller fra node_modules/three når den finnes (npm i -D three@0.170.0).
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), HUS = path.join(ROOT, 'eval', 'hus');
const require = createRequire(path.join(ROOT, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Fant ikke Playwright. Kjør: npm i -D playwright && npx playwright install chromium'); process.exit(1); }
let three = null;
try { three = path.dirname(require.resolve('three/package.json')); } catch { if (process.env.THREE_DIR) three = process.env.THREE_DIR; }

const TYPES = { html: 'text/html', js: 'text/javascript', json: 'application/json', webp: 'image/webp', png: 'image/png', svg: 'image/svg+xml', css: 'text/css' };
const server = http.createServer((req, res) => {
  // Scenen henter teksturer relativt til siden (textures/...), og siden ligger i eval/.
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/eval\/textures\//, '/textures/'));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream' }); res.end(buf);
  });
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const want = process.argv.slice(2);
const ids = fs.readdirSync(HUS).filter(id => fs.existsSync(path.join(HUS, id, 'fasit.json')) && (!want.length || want.includes(id)));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// prefers-reduced-motion gjør at kameraet hopper rett til plassen sin i stedet for å fly dit.
const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
if (three) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => r.fulfill({ path: path.join(three, new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', '')), contentType: 'text/javascript' }));
let pending = 0;
page.on('request', () => pending++); page.on('requestfinished', () => pending--); page.on('requestfailed', () => pending--);
page.on('pageerror', e => console.error('Feil i siden:', e.message));
const settle = async () => { for (let calm = 0; calm < 4;) { await page.waitForTimeout(150); calm = pending ? 0 : calm + 1; } };
await page.goto(`${base}/eval/tegn.html`);
await page.waitForFunction(() => window.husformReady, null, { timeout: 30000 });

for (const id of ids) {
  const dir = path.join(HUS, id, 'bilder'), mark = path.join(dir, '.tegnet');
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => /\.(jpe?g|png|webp)$/i.test(f)) && !fs.existsSync(mark)) { console.log(`${id}: har ekte bilder, hopper over`); continue; }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const names = await page.evaluate(h => window.husform.load(h), JSON.parse(fs.readFileSync(path.join(HUS, id, 'fasit.json'), 'utf8')));
  await settle();
  for (const [i, name] of names.entries()) {
    await page.evaluate(n => window.husform.shot(n), i);
    await settle(); // teksturer lastes først når de trengs
    await page.evaluate(n => window.husform.shot(n), i); // én gang til, så siste tekstur er med
    await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${name}.jpg`), type: 'jpeg', quality: 85 });
  }
  fs.writeFileSync(mark, 'Bildene er tegnet fra fasit.json av eval/tegn.mjs.\n');
  console.log(`${id}: ${names.length} bilder`);
}
await browser.close(); server.close();
