// All bildegenerering går gjennom denne filen.
// Kontrakt: POST ENDPOINT {mode:'edit'|'create', prompt, images:[dataURL]} -> {image: dataURL|URL}
// Anbefalt bildemodell (Higgsfield): flux_3_image (FLUX 3 Image, Black Forest Labs)
// Testet 2 bilder (generering + redigering med referanse). gpt_image_2_6 krever betalt plan og ble ikke testet.
const Provider = (() => {
  const ENDPOINT = ''; // tom = demomodus
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bildet kunne ikke leses')); i.src = src; });
  const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const tag = (x, w, h, text) => {
    x.font = `600 ${Math.max(12, w / 60)}px sans-serif`;
    const m = x.measureText(text).width, p = w / 80;
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(20,20,18,.72)'; x.fillRect(p, h - p * 4, m + p * 2, p * 3);
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(text, p * 2, h - p * 2.5);
  };
  async function demo({ mode, prompt, images }) {
    await new Promise(r => setTimeout(r, 700));
    const c = document.createElement('canvas'), x = c.getContext('2d'), k = hue(prompt);
    if (mode === 'edit') {
      const i = await load(images[0]);
      c.width = i.width; c.height = i.height; x.drawImage(i, 0, 0);
      x.globalCompositeOperation = 'color'; x.globalAlpha = .4;
      x.fillStyle = `hsl(${k} 45% 50%)`; x.fillRect(0, 0, c.width, c.height);
    } else {
      const w = c.width = 1200, h = c.height = 800, flat = /funkis|minimal/i.test(prompt);
      x.fillStyle = `hsl(${k} 25% 86%)`; x.fillRect(0, 0, w, h);
      x.fillStyle = `hsl(${(k + 90) % 360} 22% 58%)`; x.fillRect(0, 560, w, 240);
      x.fillStyle = `hsl(${k} 18% 94%)`; x.fillRect(330, 300, 540, 270);
      x.fillStyle = `hsl(${k} 12% 26%)`; x.beginPath();
      if (flat) x.rect(310, 280, 580, 24); else { x.moveTo(290, 310); x.lineTo(600, 130); x.lineTo(910, 310); }
      x.fill();
      x.fillRect(560, 430, 80, 140);
      x.fillStyle = `hsl(${k} 35% 72%)`; [380, 700].forEach(l => x.fillRect(l, 360, 120, 100));
    }
    tag(x, c.width, c.height, 'Demo');
    return { image: c.toDataURL('image/jpeg', .9) };
  }
  async function generate(req) {
    if (!ENDPOINT) return demo(req);
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (!r.ok) throw new Error(`tjenesten svarte ${r.status}`);
    return r.json();
  }
  return { generate, load, demo: !ENDPOINT };
})();
