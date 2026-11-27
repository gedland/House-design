// Husform-serveren med falsk bildetolkning, for testene. De statiske filene serveres av den ekte server.js,
// mens /api/status sier at AI er på, og /api/analyze strømmer et ferdig hus (test/fixtures/house.json) i samme
// NDJSON-format som den ekte serveren: fremdrift for hvert steg, så huset, delt over flere biter så appen må sette dem sammen.
const http = require('http');
const app = require('../server.js').server;
const house = require('./fixtures/house.json');

const wait = ms => new Promise(r => setTimeout(r, ms));
const report = {
  fixed: ['Soverommet ble justert inn mot ytterveggen.'],
  problems: ['Takvinkelen er anslått fra ett bilde. Sjekk den.'],
  guesses: 'Baksiden av huset synes ikke i bildene, så vinduene der er anslått.',
};

async function analyze(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let images;
  try { ({ images } = JSON.parse(Buffer.concat(chunks).toString())); } catch {}
  // Samme sjekk som den ekte serveren, så testen feiler hvis appen sender noe annet enn bilder.
  if (!Array.isArray(images) || images.length < 3 || !images.every(i => typeof i === 'string' && i.startsWith('data:image/jpeg;base64,'))) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: `Testserveren fikk ikke 3 JPEG-bilder (fikk ${Array.isArray(images) ? images.length : 0}).` }));
  }
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const line = o => res.write(JSON.stringify(o) + '\n');
  line({ type: 'progress', stage: 'look' }); await wait(200);
  line({ type: 'beat' }); await wait(100);
  for (const chars of [1500, 6000, 14000]) { line({ type: 'progress', stage: 'write', chars }); await wait(150); }
  line({ type: 'progress', stage: 'check' }); await wait(150);
  const done = JSON.stringify({ type: 'done', house, report, survey: { photos: images.map((_, i) => ({ photo: i + 1 })) } }) + '\n';
  const half = Math.floor(done.length / 2);
  res.write(done.slice(0, half)); await wait(150);
  res.end(done.slice(half));
}

const PORT = +process.env.PORT || 4173;
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ai":true}'); }
  if (url === '/api/analyze' && req.method === 'POST') return analyze(req, res).catch(e => { console.error(e); res.destroy(); });
  app.emit('request', req, res);
}).listen(PORT, '127.0.0.1', () => console.log(`Husform med falsk tolkning: http://127.0.0.1:${PORT}`));
