// Hele flyten: 3 bilder lastes opp → falsk /api/analyze strømmer et ferdig hus → huset vises i 3D →
// et objekt velges og endres → endringen er lagret etter omlasting.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { test, expect } = require('@playwright/test');

// Three.js hentes fra cdn.jsdelivr.net i appen. Testen serverer samme versjon fra node_modules, så den virker uten nett.
const THREE_DIR = path.join(__dirname, '..', 'node_modules', 'three');
const THREE_CDN = /\/\/cdn\.jsdelivr\.net\/npm\/three@([\d.]+)\/(.+)$/;
test.beforeAll(() => {
  const want = /cdn\.jsdelivr\.net\/npm\/three@([\d.]+)\//.exec(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'))?.[1], have = JSON.parse(fs.readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version;
  if (want !== have) throw new Error(`index.html bruker three@${want}, men testen har three@${have}. Kjør: npm install --save-dev three@${want}`);
});
test.beforeEach(async ({ page }) => {
  await page.route(THREE_CDN, route => {
    const file = path.join(THREE_DIR, THREE_CDN.exec(route.request().url())[2]);
    return fs.existsSync(file) ? route.fulfill({ path: file, contentType: 'text/javascript; charset=utf-8' }) : route.fulfill({ status: 404 });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort()); // skriften er pynt, siden virker uten
});
// Feil i appen (uhåndterte unntak) skal ikke gå upåaktet hen selv om flyten ellers ser riktig ut.
let errors = [];
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors, 'feil i nettleseren').toEqual([]));

// Lager et lite PNG-bilde (en enkel hustegning i ulike farger), så testen ikke trenger binære filer.
function png(name, wall, roof) {
  const W = 320, H = 240, raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inRoof = y > 50 && y < 110 && Math.abs(x - 160) < (y - 50) * 1.8, inWall = y >= 110 && y < 210 && x > 60 && x < 260;
    const c = inRoof ? roof : inWall ? wall : y >= 210 ? [90, 140, 70] : [170, 205, 235];
    raw.set(c, y * (W * 3 + 1) + 1 + x * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(t.length + 8); out.writeUInt32BE(data.length); t.copy(out, 4); out.writeUInt32BE(crc(t), t.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W); ihdr.writeUInt32BE(H, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const buffer = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return { name, mimeType: 'image/png', buffer };
}
const PHOTOS = [png('fasade-forside.png', [158, 43, 37], [75, 79, 83]), png('fasade-gavl.png', [150, 50, 40], [60, 60, 66]), png('stue.png', [230, 225, 214], [200, 165, 122])];

// Huset slik det ligger lagret i nettleseren (IndexedDB), det appen leser inn igjen ved neste start.
const saved = page => page.evaluate(() => new Promise((ok, no) => {
  const r = indexedDB.open('husform', 1);
  r.onerror = () => no(r.error);
  r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('house'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); };
}));
const room = (house, name) => house?.floors.flatMap(f => f.rooms).find(r => r.name === name);
const ready = page => page.waitForFunction(() => window.husformReady === true);

test('bilder inn, redigerbart hus ut, endringen overlever omlasting', async ({ page }) => {
  const panel = page.locator('#panel'), caption = page.locator('#caption');
  await page.goto('/');
  await ready(page);
  await expect(caption.locator('strong')).toHaveText('Demohus');

  // 1. Opplasting: tre bilder
  await page.getByRole('button', { name: 'Bilder' }).click();
  await expect(panel.getByRole('heading', { name: 'Fra bilder til 3D' })).toBeVisible();
  await panel.locator('input[type=file]').setInputFiles(PHOTOS);
  await expect(panel.getByText('3 av 30 bilder valgt')).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Valgte bilder' }).getByRole('img')).toHaveCount(3);

  // 2. Tolkning: bildene sendes som krympede JPEG-er, og svaret strømmes tilbake med fremdrift
  const sent = page.waitForRequest(r => r.url().endsWith('/api/analyze') && r.method() === 'POST');
  await panel.getByRole('button', { name: 'Lag 3D-modell av 3 bilder' }).click();
  const { images } = (await sent).postDataJSON();
  expect(images).toHaveLength(3);
  for (const img of images) expect(img).toMatch(/^data:image\/jpeg;base64,/);
  await expect(panel.locator('.job-text')).toContainText('Claude');

  // 3. 3D-modellen: rapporten vises, og huset fra tolkningen har erstattet demohuset
  await expect(panel.getByRole('heading', { name: 'Modellen er klar' })).toBeVisible();
  await expect(panel).toContainText('Takvinkelen er anslått');
  await panel.getByRole('button', { name: 'Se modellen' }).click();
  await expect(caption.locator('strong')).toHaveText('Testhytta');
  await expect(caption.locator('small')).toHaveText('1 etasje · 2 rom');
  await expect(caption.locator('span')).toHaveText('Ca. 60 m². Målene er anslag.');
  expect((await saved(page)).name).toBe('Testhytta');

  // Huset er tegnet som egne objekter: et trykk midt i 3D-visningen treffer en del av huset og åpner panelet for den.
  const box = await page.locator('#view').boundingBox();
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * .55);
    await expect(panel.locator('.head small')).toHaveText(/^(Tak|Vegg|Åpning|Rom|Møbel)$/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Lukk' }).click();

  // 4. Redigering: velg stua i etasjevisningen, gi den nytt navn og ny gulvfarge
  await page.locator('#floors').getByRole('button', { name: '1. etasje' }).click();
  await page.getByRole('button', { name: 'Velg Stue' }).click();
  await expect(panel.getByRole('heading', { name: 'Stue' })).toBeVisible();
  await panel.getByLabel('Navn').fill('Peisestue');
  await panel.getByLabel('Navn').press('Tab');
  await panel.getByLabel('Gulvfarge').fill('#1f6f4a');
  await expect(panel.getByRole('heading', { name: 'Peisestue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Angre' })).toBeEnabled();
  await expect.poll(async () => room(await saved(page), 'Peisestue')?.color).toBe('#1f6f4a');

  // 5. Lagring: etter omlasting er endringen der, i modellen og i panelet
  await page.reload();
  await ready(page);
  await expect(caption.locator('strong')).toHaveText('Testhytta');
  await page.locator('#floors').getByRole('button', { name: '1. etasje' }).click();
  await expect(page.getByRole('button', { name: 'Velg Stue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Velg Peisestue' }).click();
  await expect(panel.getByLabel('Navn')).toHaveValue('Peisestue');
  await expect(panel.getByLabel('Gulvfarge')).toHaveValue('#1f6f4a');
  const after = await saved(page);
  expect(room(after, 'Peisestue')).toMatchObject({ w: 6, d: 6, color: '#1f6f4a' });
  expect(room(after, 'Soverom')).toMatchObject({ color: '#dcb27a' });
});
