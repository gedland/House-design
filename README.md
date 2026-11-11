# Husdesign
Endre huset ditt med tekst, eller lag et nytt. Appen er en PWA uten byggesteg og virker helt uten server (demomodus) og uten nett etter første besøk.

**GitHub Pages:** Settings → Pages → Source «Deploy from a branch» → velg grenen og mappen `/ (root)` → Save. Appen havner på `https://<bruker>.github.io/House-design/`. Alle stier er relative.
**iPhone:** åpne adressen i Safari → Del → «Legg til på Hjem-skjerm».
**Lokalt (valgfritt):** `node server.js` (Node 18+, ingen pakker) og åpne http://localhost:3000.
**Ekte AI (valgfritt, krever serveren):** lag `.env` med `IMAGE_PROVIDER=gemini` eller `openai` og `IMAGE_API_KEY=...` (valgfritt `IMAGE_MODEL`, `PORT`), og sett `ENDPOINT = 'api/image'` i `provider.js`. Koster penger per bilde; sjekk prisene hos leverandøren først.
Ved endringer i filene: øk `VERSION` i `service-worker.js`.
