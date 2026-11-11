# Husdesign
Endre huset ditt med tekst, eller lag et nytt. PWA uten byggesteg: virker helt uten server (gratis demomodus) og uten nett etter første besøk.

**Gratis (standard):** demomodus. Marker et område med penselen, velg element og farge; resultatet er en forhåndsvisning laget i nettleseren, ikke AI. Bilder og versjoner lagres lokalt i nettleseren (IndexedDB); «Slett alt» fjerner dem.
**Nettsted (Netlify Drop eller GitHub Pages):** last opp mappen som den er. Alle stier er relative. På iPhone: Safari → Del → «Legg til på Hjem-skjerm».
**Lokalt:** `node server.js` (Node 18+, ingen pakker) og åpne http://localhost:3000.
**Ekte AI (valgfritt, krever `node server.js`):** lag `.env` med `IMAGE_PROVIDER=gemini` eller `openai` og `IMAGE_API_KEY=...` (valgfritt `IMAGE_MODEL`, `PORT`).
- gemini: nøkkel fra Google AI Studio. Standardmodell `gemini-2.5-flash-image`; masken sendes som ekstra bilde med tekstinstruks.
- openai: nøkkel fra OpenAI med betalingsmåte. Standardmodell `gpt-image-1`; masken sendes som ekte maske.
**Advarsel:** ekte generering koster penger per bilde. Gratiskvoter varierer, endres ofte og dekker ikke alltid bildemodeller. Sjekk prisene hos leverandøren først.
Feiler AI-kallet (f.eks. kvote brukt opp), viser appen en forhåndsvisning og en feilmelding.
Ved endringer i filene: øk `VERSION` i `service-worker.js`.
