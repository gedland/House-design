# Husform
Bilder av ett hus inn → redigerbar 3D-modell. Nettapp uten byggesteg (vanilla JS + Three.js fra CDN), mobil først, norsk grensesnitt.

## Slik virker den
1. **Bilder:** velg 5–30 bilder av ett hus, ute og inne. De krympes i nettleseren (lang side 1280 px), vises som en liste der enkeltbilder kan fjernes, og sendes til serveren. Fremdriften vises mens Claude tolker, og feil gis som norske meldinger.
2. **Tolkning:** serveren spør Claude (`claude-opus-5-5`). Instruksen ber Claude arbeide i fast rekkefølge: ytre form og grunnflate fra utebildene, så etasjer og tak, så rominndeling fra innebildene, så dører og vinduer, til slutt møbler. Målene regnes ut fra kjente størrelser (dør 2,1 m, benk 0,9 m, etasjehøyde ca. 2,7 m), og det som ikke synes, anslås. Svaret er en kort befaring pluss ett hus i JSON-skjemaet. Før huset tegnes, kontrolleres det (`inspect()` i `js/house.js`): ytterveggene skal danne en lukket form, rommene skal ligge innenfor og ikke overlappe, dører og vinduer skal ligge innenfor veggen sin, og møblene skal stå inne i et rom. Småfeil rettes automatisk. Gjenstår alvorlige feil, får Claude én runde til å rette dem. Alt som ble rettet, alt som bør sjekkes og alt som er anslått, vises i en rapport etterpå.
3. **3D:** Three.js tegner JSON-en. Hver vegg, hvert gulv, tak, vindu og møbel er et eget objekt. Taket følger grunnflaten: fløyer og lavere deler uten etasje over får sitt eget tak. Huset står under en himmel med dis mot horisonten. Månen øverst bytter til kveldslys: lav, varm sol, lys i hvert rom og vinduer som gløder. Kameraet glir mellom visningene, og et nytt hus vises med en kort dronetur inn mot det.
4. **Rediger:** trykk på et objekt for å endre farge, materiale og mål, flytte eller slette. «Legg til» gir vegg, dør, vindu, rom, etasje og møbler. Naboene følger med: flytter du en vegg, forlenges veggene som møter den, rommene langs den endrer størrelse, dører og vinduer blir stående i veggen sin, og taket følger ytterveggene. «Gå inn» flyr inn gjennom det største vinduet og blir stående inne i rommet. Romnavn svever i rommene du kan se. I etasjevisningen velger et trykk på navnet rommet, inne i huset går du dit. Bildeteksten øverst viser hvor du er, med anslåtte mål.
5. **Lagre:** alle endringer oppdaterer JSON-en og lagres i nettleseren (IndexedDB), med angre. «Mer» eksporterer JSON og GLB, og importerer JSON.

## Kjør
```bash
npm install
```
```bash
node server.js
```
Åpne http://localhost:3000 (Node 18+).

**Uten API-nøkkel** vises demohuset, og alt unntatt bildetolkning virker. Det gjelder også når filene legges rett på en statisk vert som GitHub Pages.
**Med egne bilder:** lag `.env` med `ANTHROPIC_API_KEY=...` (valgfritt `CLAUDE_MODEL`, `PORT`, `HOST`). Nøkkelen brukes bare på serveren. Hvert hus koster penger hos Anthropic.
Serveren har ingen innlogging. Legger du den åpent på nettet, kan alle som finner den bruke nøkkelen din.

## Filer
- `js/house.js`: JSON-skjemaet (øverst i filen), demohuset, `normalize()` og kontrollen `inspect()`. Serveren bruker samme fil (`js/package.json` gjør den til en ES-modul for Node).
- `js/scene.js`: JSON → Three.js.
- `js/app.js`: grensesnitt, redigering, lagring, eksport.
- `server.js`: statiske filer og `POST /api/analyze`. Svaret strømmes som linjer med JSON (fremdrift, så huset eller en feil).

Ved endringer i filene: øk `VERSION` i `service-worker.js`.

## Skjermbilder (for utvikling)
`tools/bilder.js` tar skjermbilder av demohuset fra faste kameravinkler, så du kan sammenligne før og etter en endring. Skriptet er ikke en del av appen og endrer ingen appfiler.

Første gang (installerer Playwright og Three.js i `tools/node_modules`, og nettleseren Playwright bruker):
```bash
npm install --prefix tools
npx --prefix tools playwright install chromium
```
Ta bilder:
```bash
node tools/bilder.js            # eller med et navn: node tools/bilder.js for-tak
```
Bildene havner i `tools/bilder/<dato>_<tid>[-navn]/` (ikke i git). Kjør én gang før endringen og én gang etter, og sammenlign mappene. Skriptet skriver også hvilken kjøring som var den forrige. Hver mappe har tolv bilder, i 1280×800 (`-desktop`) og 390×844 (`-mobil`):

| Fil | Vinkel |
|---|---|
| `hus-dag` | Hele huset utenfra, lyst tema |
| `hus-kveld` | Samme vinkel, mørkt tema (appen har ikke eget kveldslys) |
| `etasje-1` (og `etasje-2` …) | Etasjevisning ovenfra, uten tak |
| `stue-vindu` | Inne i stua, mot det bredeste vinduet |
| `stue-kjokken` | Inne i stua, mot døren til kjøkkenet |
| `soverom` | Fra hjørnet ved døren, på skrå over rommet |

`info.json` i mappen viser commit, filer som ikke er committet, og om Three.js kom fra CDN eller fra npm.

Vinklene regnes ut fra demohuset i `js/house.js`: rommene finnes etter navn (Stue, Kjøkken, Soverom), vinduer og dører etter hvor de står. Endres demohuset, flytter vinklene seg med. Finnes ikke et rom, hoppes bildet over, og skriptet sier fra.

Skriptet starter sin egen filtjener for repoet, så det trengs verken `node server.js` eller API-nøkkel. Three.js hentes fra CDN-en i importmap-en. Er CDN-en blokkert, brukes npm-pakken i `tools/node_modules/three` i stedet. Versjonen i `tools/package.json` må være den samme som i `index.html`, ellers advarer skriptet.

Valg:
- `--lokal`: bruk Three.js fra npm med en gang, uten å prøve CDN-en.
- `--url http://localhost:3000`: ta bilder av en app som allerede kjører, i stedet for den innebygde filtjeneren.
- `--skala 1`: pikseltetthet (standard 2). 1 gir mindre filer og går omtrent dobbelt så fort.
- `--ut <mappe>`: lagre et annet sted enn `tools/bilder`.
- `--chromium <sti>` (eller `CHROMIUM_PATH`): bruk en Chrome eller Chromium du allerede har.
