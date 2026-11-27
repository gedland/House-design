# Husform
Bilder av ett hus inn → redigerbar 3D-modell. Nettapp uten byggesteg (vanilla JS + Three.js fra CDN), mobil først, norsk grensesnitt.

## Slik virker den
1. **Bilder:** velg 1–30 bilder av ett hus, ute og inne. Én er nok for en første modell: det som mangler, anslås og listes i rapporten etterpå. En kort sjekkliste viser hvilke bilder som gir best modell (alle fasader, tak, hvert rom). De krympes i nettleseren (lang side 1280 px), vises som en liste der enkeltbilder kan fjernes, og sendes til serveren. Mens Claude tolker, vises fire trinn (sender, tolker, skriver modell, kontrollerer) med anslått tid igjen. Anslaget lærer av de forrige tolkningene i nettleseren. Så snart grunnflaten i første etasje er skrevet, vises en forhåndsvisning i 3D som vokser etter hvert som Claude skriver. Lukkes siden underveis, får brukeren beskjed ved neste besøk om at bildene må lastes opp på nytt. Feil gis som norske meldinger.

2. **Tolkning:** serveren spør Claude (`claude-opus-5-5`). Instruksen ber Claude arbeide i fast rekkefølge: ytre form og grunnflate fra utebildene, så etasjer og tak, så rominndeling fra innebildene, så dører og vinduer, til slutt møbler. Målene regnes ut fra kjente størrelser (dør 2,1 m, benk 0,9 m, etasjehøyde ca. 2,7 m), og det som ikke synes, anslås. Svaret er en kort befaring pluss ett hus i JSON-skjemaet. Før huset tegnes, kontrolleres det (`inspect()` i `js/house.js`): ytterveggene skal danne en lukket form, rommene skal ligge innenfor og ikke overlappe, dører og vinduer skal ligge innenfor veggen sin, og møblene skal stå inne i et rom. Småfeil rettes automatisk. Gjenstår alvorlige feil, får Claude én runde til å rette dem. Alt som ble rettet, alt som bør sjekkes og alt som er anslått, vises i en rapport etterpå.
3. **3D:** Three.js tegner JSON-en. Hver vegg, hvert gulv, tak, vindu og møbel er et eget objekt. Taket følger grunnflaten: fløyer og lavere deler uten etasje over får sitt eget tak. Huset står under en himmel med dis mot horisonten. Månen øverst bytter til kveldslys: lav, varm sol, lys i hvert rom og vinduer som gløder. Kameraet glir mellom visningene, og et nytt hus vises med en kort dronetur inn mot det. Overflatene har PBR-teksturer (farge, normal, ruhet, AO) i riktig målestokk: eik, furu, hvitlasert parkett, hvit og grå flis, mikrosement, puss, maling, hvitmalt og beiset panel, teglstein, betongtakstein, skifer, betong, stoff og lær. Fargen i JSON farger teksturen, så alt kan få hvilken som helst farge. Teksturene lastes først når en modell trenger dem, og til da vises ren farge.
4. **Rediger:** trykk på et objekt for å endre farge, materiale og mål, flytte eller slette. En dør kan stå åpen (0–90°) med hengslene til venstre eller høyre. «Legg til» gir vegg, dør, vindu, rom, etasje og møbler. Naboene følger med: flytter du en vegg, forlenges veggene som møter den, rommene langs den endrer størrelse, dører og vinduer blir stående i veggen sin, og taket følger ytterveggene. «Gå inn» flyr inn gjennom det største vinduet og blir stående inne i rommet. Romnavn svever i rommene du kan se. I etasjevisningen velger et trykk på navnet rommet, inne i huset går du dit. Bildeteksten øverst viser hvor du er, med anslåtte mål.
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

**Før lenken deles** har `/api/analyze` et vern mot misbruk og kostnader (ingen innlogging, ingen ekstra pakker):
- Høyst 3 hus per nettverksadresse per døgn (`PER_IP_LIMIT`). IPv6-adresser regnes per /64-blokk.
- Høyst 20 hus totalt per døgn for alle brukerne til sammen (`DAILY_LIMIT`). `DAILY_LIMIT=0` slår av bildetolkningen.
- Valgfri tilgangskode: `ACCESS_CODE=...`. Appen spør om koden før opplasting og husker den på enheten. Etter 10 feil koder fra samme adresse stenges den adressen ut døgnet.
- Døgnet følger norsk tid og nullstilles ved midnatt. Tellingen lagres i `.husform-usage.json` (eller `USAGE_FILE`), så en omstart ikke nullstiller den. Adressene lagres bare som hash.
- Et hus telles når Claude spørres. Feiler det før Claude begynner å svare, telles det ikke.
- Bak en mellomtjener (Fly, nginx, Cloudflare): sett `TRUST_PROXY` til antall mellomtjenere foran serveren, vanligvis `1`. Ellers ser serveren bare mellomtjenerens adresse, og alle deler de samme 3 husene. Uten mellomtjener skal den stå tom, ellers kan grensen omgås. På Render og Railway er `TRUST_PROXY=1` standard.

## Legg ut på nett
Appen kjører som en vanlig Node-tjeneste på Render eller Railway. Oppsettet ligger i repoet: `render.yaml` (Render) og `railway.json` (Railway). Begge starter `node server.js` og bruker helsesjekken `GET /healthz`, som svarer `{"ok":true,"ai":true|false}` uten å kalle Claude.

**API-nøkkelen settes bare som hemmelighet hos verten**, aldri i repoet eller i en `.env` som sjekkes inn.

- **Render:** New → Blueprint → velg repoet. Render leser `render.yaml` og ber om verdien til `ANTHROPIC_API_KEY`. Lim inn nøkkelen der.
- **Railway:** New Project → Deploy from GitHub repo → velg repoet. Legg nøkkelen inn under Variables som `ANTHROPIC_API_KEY`, og lag en offentlig adresse under Settings → Networking.

Verten setter `PORT`. Serveren lytter da på `0.0.0.0` (alle grensesnitt) på Render og Railway, og på `127.0.0.1` lokalt. Begge kan overstyres med `PORT` og `HOST`. `CLAUDE_MODEL` kan settes på samme måte. Endres en variabel, må tjenesten starte på nytt.

Sjekk etterpå at `https://<adressen>/healthz` svarer med `"ai":true`. Med `"ai":false` mangler nøkkelen, og appen viser bare demohuset.

**Obs:** serveren har ingen innlogging. Grensene over (og gjerne `ACCESS_CODE`) begrenser hvor mye andre kan tolke på din regning. Sett i tillegg en månedlig utgiftsgrense i Anthropic Console.

## Test
```bash
npx playwright install chromium
```
```bash
npm test
```
Første kommando trengs bare én gang per maskin. `npm test` kjører en Playwright-test av hele flyten på en mobilskjerm: tre genererte bilder lastes opp, en falsk `/api/analyze` (`test/fake-server.js`) strømmer et ferdig hus (`test/fixtures/house.json`) i samme format som den ekte serveren, og testen sjekker at huset vises, at et trykk i 3D-visningen velger en del av huset, at et rom kan få nytt navn og ny gulvfarge, og at endringen er lagret etter omlasting. Testen bruker ingen API-nøkkel og trenger ikke nett: Three.js serveres fra `node_modules` (samme versjon som i `index.html`).

## Filer
- `js/house.js`: JSON-skjemaet (øverst i filen), demohuset, `normalize()` og kontrollen `inspect()`. Serveren bruker samme fil (`js/package.json` gjør den til en ES-modul for Node).
- `js/scene.js`: JSON → Three.js.
- `textures/`: PBR-teksturer fra [Poly Haven](https://polyhaven.com) (CC0), 1k webp. `textures/lag.py` laster dem ned og lager dem på nytt (Python med numpy og Pillow).
- `js/app.js`: grensesnitt, redigering, lagring, eksport.
- `modeller/`: ferdige hus i JSON-skjemaet, som kan åpnes med «Mer» → «Importer JSON». `haukeberget-17.json` er tolket fra planløsningene (U.etg og 1.etg) og bildene av huset.
- `server.js`: statiske filer og `POST /api/analyze`. Svaret strømmes som linjer med JSON (fremdrift, forhåndsvisning av huset så langt, så huset eller en feil). Forhåndsvisningen lages ved å lese det halvferdige JSON-svaret (`partialJSON()`).
- `test/`: ende-til-ende-testen (`flyt.spec.js`), testserveren med falsk tolkning og testhuset. Oppsett i `playwright.config.js`.
- `eval/`: hus med bilder og fasit, og `npm run eval`, som kjører tolkningen på dem, måler grunnflate, etasjer, takform og dører og vinduer per fasade, og foreslår endringer i prompten. Se `eval/README.md`.

Ved endringer i filene: øk `VERSION` i `service-worker.js`.
