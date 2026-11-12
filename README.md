# Husform
Bilder av ett hus inn → redigerbar 3D-modell. Nettapp uten byggesteg (vanilla JS + Three.js fra CDN), mobil først.

**Status: MVP.** Demohuset (ett rom) tegnes fra JSON. Trykk på vegg, gulv, dør, vindu eller møbel for å endre farge, materiale og mål, flytte eller slette. Endringer lagres i nettleseren (IndexedDB), med angre.
**Kommer:** bildeopplasting og tolkning med Claude API, legg til nye objekter, tak og flere etasjer, interiørmodus, eksport til JSON og GLB.

**Kjør lokalt:** `node server.js` (Node 18+, ingen pakker) og åpne http://localhost:3000.
JSON-skjemaet står øverst i `js/house.js`. Ved endringer i filene: øk `VERSION` i `service-worker.js`.
