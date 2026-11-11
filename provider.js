// Bytt ut dette for å koble til en ekte bildemodell.
// Endepunktet får POST med JSON: { mode: "edit"|"generate", prompt, images: [dataURL] }
// og skal svare med JSON: { image: "<dataURL eller URL>" }.
// API-nøkkelen skal ligge på serveren, aldri i nettleseren.
window.ImageProvider = {
  endpoint() {
    try { return localStorage.getItem("endpoint") || ""; } catch { return ""; }
  },

  async run({ mode, prompt, images }) {
    const url = this.endpoint();
    if (!url) return this.demo(mode, images);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, prompt, images }),
    });
    if (!res.ok) throw new Error("Serveren svarte " + res.status);
    const data = await res.json();
    if (!data.image) throw new Error("Svaret mangler bilde");
    return data.image;
  },

  // Demomodus: simulerer en endring ved å fargelegge originalen.
  async demo(mode, images) {
    await new Promise(r => setTimeout(r, 900));
    const src = images[0];
    if (!src) throw new Error("Demomodus trenger et referansebilde");
    const img = await new Promise((ok, no) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 55% 55%)`;
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  },
};
