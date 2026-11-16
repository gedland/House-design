# Husform: konseptet

Husform er en nettapp der brukeren laster opp bilder av et hus og får tilbake en
redigerbar 3D-modell av det samme huset. Bildene er eneste inndata. Brukeren skal
ikke tegne, måle eller plassere noe selv for å få en første modell.

## Flyten

1. **Opplasting:** flere bilder av ett og samme hus, utvendig (fasader fra ulike
   sider, tak) og innvendig (rom, dører, vinduer, møbler).
2. **Tolkning:** bildene blir en strukturert beskrivelse av huset: etasjer, rom,
   vegger, dører, vinduer, takform, materialer, farger og møbler, med anslåtte mål.
   Det som ikke synes, anslås i stedet for å utelates, så modellen alltid blir et helt hus.
3. **3D-modell:** beskrivelsen tegnes som en modell brukeren kan rotere, zoome i og
   gå inn i. Den skal ligne huset i form, proporsjoner, takform, plassering av
   vinduer og dører, og farger.
4. **Redigering (kjernen):** modellen er satt sammen av enkeltdeler. Hver vegg,
   hvert gulv, tak, vindu, dør og møbel er et eget objekt som kan velges og endres
   (farge, materiale, mål, plassering) eller slettes. Brukeren kan legge til nye
   deler: vegger, vinduer, rom og etasjer.
5. **Lagring:** alle endringer lagres i den samme strukturerte beskrivelsen, så
   modellen kan åpnes igjen, angres i og eksporteres.

## Prinsipper

- Bildene er utgangspunktet, redigeringen er poenget. Den genererte modellen er et
  førsteutkast brukeren jobber videre med (ombygging, nye farger, ny planløsning).
- Modellen er parametrisk: deler med mål og egenskaper. Aldri fotogrammetri-mesh
  eller punktsky som bare kan ses på.
- Målene er anslag. Appen skal være ærlig om det og gjøre det enkelt å rette dem.
- Mobil først, norsk grensesnitt.

## Slik vurderes endringer

Spør om hver endring:
1. Gjør den veien fra bilder til en modell som ligner huset kortere eller bedre?
2. Forblir alle deler av modellen redigerbare etterpå?

Nye egenskaper i modellen skal inn i JSON-skjemaet (ikke bare i 3D-scenen), så de
lagres, angres og eksporteres sammen med resten.

## Praktisk

- JSON-skjemaet står øverst i `js/house.js`. `normalize()` der må tåle alt som kommer
  fra AI, fil og lagring. Endres skjemaet, oppdater også prompten i `server.js`.
- `js/scene.js` tegner JSON til Three.js, `js/app.js` er grensesnitt og redigering.
- Ingen byggesteg: vanilla JS med Three.js fra CDN.
- Ved endringer i appfilene: øk `VERSION` i `service-worker.js`.
