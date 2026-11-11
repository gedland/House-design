# Husform
Start: `node server.js` (Node 18+, ingen pakker) og åpne http://localhost:3000.
**Gratis (standard):** demomodus. Marker et område med penselen, velg element og farge; resultatet er en forhåndsvisning laget i nettleseren, ikke AI.
**Ekte AI (valgfritt):** lag `.env` med `IMAGE_PROVIDER=gemini` eller `openai` og `IMAGE_API_KEY=...`. Valgfritt: `IMAGE_MODEL`, `PORT`.
- gemini: nøkkel fra Google AI Studio. Standardmodell `gemini-2.5-flash-image`; masken sendes som ekstra bilde med tekstinstruks.
- openai: nøkkel fra OpenAI med betalingsmåte. Standardmodell `gpt-image-1`; masken sendes som ekte maske.
**Advarsel:** ekte generering koster penger per bilde. Gratiskvoter varierer, endres ofte og dekker ikke alltid bildemodeller. Sjekk prisene hos leverandøren først.
Feiler AI-kallet (f.eks. kvote brukt opp), viser appen en forhåndsvisning og en feilmelding. Bilder og versjoner lagres lokalt i nettleseren (IndexedDB); «Slett alt» fjerner dem.
