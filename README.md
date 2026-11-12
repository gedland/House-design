# Husform
Bilder av ett hus inn → redigerbar 3D-modell. Nettapp uten byggesteg (vanilla JS + Three.js fra CDN), mobil først, norsk grensesnitt.

## Slik virker den
1. **Bilder:** velg 5–30 bilder av ett hus, ute og inne. De krympes i nettleseren (lang side 1280 px), vises som en liste der enkeltbilder kan fjernes, og sendes til serveren. Fremdriften vises mens Claude tolker, og feil gis som norske meldinger.
2. **Tolkning:** serveren spør Claude (`claude-opus-5-5`) og får tilbake ett JSON-objekt: etasjer, rom, vegger, dører, vinduer, tak, materialer, farger og møbler. Målene er anslag.
3. **3D:** Three.js tegner JSON-en. Hver vegg, hvert gulv, tak, vindu og møbel er et eget objekt.
4. **Rediger:** trykk på et objekt for å endre farge, materiale og mål, flytte eller slette. «Legg til» gir vegg, dør, vindu, rom, etasje og møbler. «Gå inn» er interiørmodus.
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
- `js/house.js`: JSON-skjemaet (øverst i filen), demohuset og validering.
- `js/scene.js`: JSON → Three.js.
- `js/app.js`: grensesnitt, redigering, lagring, eksport.
- `server.js`: statiske filer og `POST /api/analyze`. Svaret strømmes som linjer med JSON (fremdrift, så huset eller en feil).

Ved endringer i filene: øk `VERSION` i `service-worker.js`.
