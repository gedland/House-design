// All bildegenerering går gjennom denne filen.
// Kontrakt: POST /api/image {mode:'edit'|'create', prompt, images:[dataURL], mask:dataURL|null} -> {image: dataURL}
// Uten server eller nøkkel brukes demomodus: en forhåndsvisning laget i nettleseren, ikke AI.
const Provider = (() => {
  const LABEL = 'Forhåndsvisning – ikke AI', TEXTURE = { vinduer: 1, hage: 1, tak: .9 };
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Bildet kunne ikke leses.')); i.src = src; });
  const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const tag = (x, w, h, text) => {
    x.font = `600 ${Math.max(12, w / 60)}px sans-serif`;
    const m = x.measureText(text).width, p = w / 80;
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(20,20,18,.72)'; x.fillRect(w - m - p * 3, h - p * 4, m + p * 2, p * 3); // nede til høyre: synlig på «Etter»-siden
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(text, w - m - p * 2, h - p * 2.5);
  };
  // Legger ønsket farge på markert område. Lysheten i hvert punkt følger originalen, så skygger og tekstur blir med.
  async function recolor({ images, mask, color = '#888888', element }) {
    if (!mask) throw new Error('Marker området som skal endres med penselen først. Forhåndsvisningen uten AI trenger en markering.');
    const i = await load(images[0]), w = i.width, h = i.height, c = canvas(w, h), x = c.getContext('2d'), m = canvas(w, h), mx = m.getContext('2d');
    x.drawImage(i, 0, 0);
    mx.filter = `blur(${Math.max(1, w / 500)}px)`; mx.drawImage(mask, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), p = d.data, a = mx.getImageData(0, 0, w, h).data;
    const [r, g, b] = [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16)), keep = TEXTURE[element] ?? .8;
    const lum = k => .299 * p[k] + .587 * p[k + 1] + .114 * p[k + 2];
    let sum = 0, n = 0;
    for (let k = 0; k < p.length; k += 4) if (a[k + 3] > 128) { sum += lum(k); n++; }
    const mean = Math.max(1, sum / (n || 1));
    for (let k = 0; k < p.length; k += 4) {
      const al = a[k + 3] / 255 * .94; if (!al) continue;
      const f = Math.max(0, 1 + (lum(k) / mean - 1) * keep), hi = f > 1 ? (f - 1) * 60 : 0;
      p[k] += (Math.min(255, r * f + hi) - p[k]) * al; p[k + 1] += (Math.min(255, g * f + hi) - p[k + 1]) * al; p[k + 2] += (Math.min(255, b * f + hi) - p[k + 2]) * al;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  function sketch(prompt) {
    const c = canvas(1200, 800), x = c.getContext('2d'), k = hue(prompt), w = 1200, h = 800, flat = /funkis|minimal/i.test(prompt);
    x.fillStyle = `hsl(${k} 25% 86%)`; x.fillRect(0, 0, w, h);
    x.fillStyle = `hsl(${(k + 90) % 360} 22% 58%)`; x.fillRect(0, 560, w, 240);
    x.fillStyle = `hsl(${k} 18% 94%)`; x.fillRect(330, 300, 540, 270);
    x.fillStyle = `hsl(${k} 12% 26%)`; x.beginPath();
    if (flat) x.rect(310, 280, 580, 24); else { x.moveTo(290, 310); x.lineTo(600, 130); x.lineTo(910, 310); }
    x.fill();
    x.fillRect(560, 430, 80, 140);
    x.fillStyle = `hsl(${k} 35% 72%)`; [380, 700].forEach(l => x.fillRect(l, 360, 120, 100));
    return c;
  }
  async function demo(req) {
    const c = req.mode === 'edit' ? await recolor(req) : sketch(req.prompt);
    tag(c.getContext('2d'), c.width, c.height, LABEL);
    return { image: c.toDataURL('image/jpeg', .9), preview: true };
  }
  // 'alpha': gjennomsiktig der det skal endres (OpenAI). 'bw': hvitt der det skal endres (sendes som ekstra bilde).
  function maskURL(mask, fmt) {
    const c = canvas(mask.width, mask.height), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    if (fmt === 'alpha') { x.globalCompositeOperation = 'destination-out'; x.drawImage(mask, 0, 0); }
    else {
      const t = canvas(c.width, c.height), tx = t.getContext('2d');
      tx.drawImage(mask, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, c.width, c.height);
      x.drawImage(t, 0, 0);
    }
    return c.toDataURL('image/png');
  }
  let st;
  const status = () => st ??= fetch('/api/image').then(r => r.ok ? r.json() : Promise.reject()).catch(() => ({ demo: true, provider: 'demo' }));
  async function generate(req) {
    const s = await status();
    if (s.demo) return demo(req);
    let msg;
    try {
      const body = { mode: req.mode, prompt: req.prompt, images: req.images, mask: req.mask && s.mask ? maskURL(req.mask, s.mask) : null };
      const r = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (j.demo) return demo(req);
      if (r.ok && j.image) return { image: j.image };
      msg = j.error || `Bildetjenesten svarte med feil ${r.status}.`;
    } catch { msg = 'Fikk ikke kontakt med serveren. Sjekk at «node server.js» kjører.'; }
    try { return { ...await demo(req), warning: `${msg} Viser forhåndsvisning uten AI i stedet.` }; }
    catch { throw new Error(msg); }
  }
  return { generate, status };
})();
