const $ = s => document.querySelector(s);
const LABELS = ["Utside", "Stue", "Kjøkken", "Bad", "Soverom", "Tomt"];
const CHIPS = ["Hvit", "Mørk grå", "Lys eik", "Svart stål", "Tegl", "Betong", "Grønn", "Naturtre"];

const state = { photos: [], active: null, tab: "edit" };
// photo: { id, label, versions: [dataURL], index }

const uid = () => Math.random().toString(36).slice(2, 9);
const cur = () => state.photos.find(p => p.id === state.active);

function readFile(f) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f);
  });
}

async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const url = await readFile(f);
    const p = { id: uid(), label: LABELS[0], versions: [url], index: 0 };
    state.photos.push(p);
    state.active ||= p.id;
  }
  render();
}

function buildEditPrompt() {
  const el = $("#element").value, to = $("#to").value.trim() || "[beskriv ønsket endring]";
  const lines = [];
  if ($("#keep").checked) lines.push("Behold: husets form, proporsjoner, kameravinkel og lys uendret.");
  lines.push(`Endre: kun ${el.toLowerCase()}.`, `Til: ${to}.`);
  lines.push("Ikke: legg til eller fjern andre ting.");
  const extra = $("#extra").value.trim();
  if (extra) lines.push(extra);
  return lines.join("\n");
}

function buildGenPrompt() {
  const parts = [$("#desc").value.trim(), $("#style").value.trim() && `Stil: ${$("#style").value.trim()}`, `Vis: ${$("#view").value.toLowerCase()}`];
  return parts.filter(Boolean).join("\n") + "\nFotorealistisk, naturlig dagslys.";
}

function render() {
  const p = cur();
  $("#thumbs").innerHTML = "";
  state.photos.forEach(ph => {
    const d = document.createElement("div");
    d.className = "thumb" + (ph.id === state.active ? " active" : "");
    d.innerHTML = `<img src="${ph.versions[ph.index]}" alt=""><button class="x" title="Fjern">×</button>
      <select>${LABELS.map(l => `<option${l === ph.label ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    d.onclick = e => {
      if (e.target.tagName === "SELECT") return;
      if (e.target.className === "x") { state.photos = state.photos.filter(x => x.id !== ph.id); if (state.active === ph.id) state.active = state.photos[0]?.id; }
      else state.active = ph.id;
      render();
    };
    d.querySelector("select").onchange = e => { ph.label = e.target.value; };
    $("#thumbs").append(d);
  });

  $("#empty").hidden = !!p;
  $("#compare").hidden = !p;
  $("#versions").innerHTML = "";
  if (p) {
    $("#imgBefore").src = p.versions[0];
    $("#imgAfter").src = p.versions[p.index];
    p.versions.forEach((v, i) => {
      const im = document.createElement("img");
      im.src = v; im.title = i ? `Versjon ${i}` : "Original";
      if (i === p.index) im.className = "active";
      im.onclick = () => { p.index = i; render(); };
      $("#versions").append(im);
    });
    sizeBefore();
  }
  $("#promptPreview").textContent = buildEditPrompt();
}

function sizeBefore() {
  const w = $("#compare").clientWidth;
  $("#imgBefore").style.setProperty("--w", w + "px");
  $("#beforeWrap").style.width = $("#slider").value + "%";
}

async function run(mode, prompt, images) {
  $("#busy").hidden = false;
  try { return await ImageProvider.run({ mode, prompt, images }); }
  catch (e) { alert("Noe gikk galt: " + e.message); return null; }
  finally { $("#busy").hidden = true; }
}

async function apply() {
  const p = cur(); if (!p) return alert("Last opp et bilde først.");
  const img = await run("edit", buildEditPrompt(), [p.versions[p.index]]);
  if (!img) return;
  p.versions = p.versions.slice(0, p.index + 1).concat(img);
  p.index = p.versions.length - 1;
  render();
}

async function generate() {
  if (!$("#desc").value.trim() && !state.photos.length) return alert("Beskriv huset eller last opp referansebilder.");
  const refs = state.photos.map(p => p.versions[p.index]);
  const img = await run("generate", buildGenPrompt(), refs);
  if (!img) return;
  const p = { id: uid(), label: $("#view").value === "Utsiden" ? "Utside" : $("#view").value, versions: [img], index: 0 };
  state.photos.push(p); state.active = p.id; render();
}

function setTab(t) {
  state.tab = t;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  $("#editPane").hidden = t !== "edit";
  $("#genPane").hidden = t !== "generate";
}

// Hendelser
$("#file").onchange = e => addFiles(e.target.files);
const drop = $("#drop");
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
$("#slider").oninput = sizeBefore;
window.onresize = sizeBefore;
$("#apply").onclick = apply;
$("#generate").onclick = generate;
$("#undo").onclick = () => { const p = cur(); if (p && p.index > 0) { p.index--; render(); } };
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setTab(b.dataset.tab));
["#element", "#to", "#extra", "#keep"].forEach(s => $(s).addEventListener("input", () => $("#promptPreview").textContent = buildEditPrompt()));
CHIPS.forEach(c => {
  const b = document.createElement("button"); b.className = "chip"; b.textContent = c;
  b.onclick = () => { $("#to").value = c.toLowerCase(); $("#promptPreview").textContent = buildEditPrompt(); };
  $("#chips").append(b);
});
$("#settingsBtn").onclick = () => { $("#endpoint").value = ImageProvider.endpoint(); $("#settings").showModal(); };
$("#saveSettings").onclick = () => { try { localStorage.setItem("endpoint", $("#endpoint").value.trim()); } catch {} };

render();
