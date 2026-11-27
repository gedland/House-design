# Eval: ligner modellen huset?

Kjører tolkningen (`analyze()` i `server.js`) på bildene av noen hus der fasiten er kjent, og måler hvor nær modellen kommer på det som avgjør om modellen ligner huset:

- **grunnflate:** bredde (langs inngangsfasaden), dybde og areal
- **antall etasjer**
- **takform** (og takvinkel)
- **antall dører og vinduer per fasade:** forside, høyre side, bakside og venstre side, summert over etasjene

Til slutt skrives en rapport med forslag til endringer i prompten (`PROMPT` i `server.js`), ut fra avvikene som går igjen.

## Kjør

```bash
npm run eval
```

Det krever `ANTHROPIC_API_KEY` i `.env`, som for `node server.js`. Hvert hus koster ett eller to Claude-kall. Svarene og `rapport.md` havner i `eval/resultater/<tidspunkt>/`.

```bash
node eval/kjor.mjs rodt-saltak --ganger 3
```

Svarene varierer fra gang til gang. Kjør hvert hus flere ganger før du stoler på et mønster. `--samtidig 2` kjører to tolkninger om gangen.

```bash
node eval/kjor.mjs --svar eval/resultater/<tidspunkt>
```

Sammenligner lagrede svar på nytt uten Claude, for eksempel etter en endring i `mal.mjs`.

```bash
node eval/kjor.mjs --selvtest
```

Sjekker at sammenligningen gir null avvik når fasiten sammenlignes med seg selv, og at et speilvendt hus blir oppdaget.

## Husene

| Hus | Hva det tester |
|---|---|
| `rodt-saltak` | Rødt trehus, 10 × 7 m, saltak 38°. Loftsetasje med lav knevegg og vinduer bare i gavlene. Ytterdør også på baksiden. |
| `funkis-flatt` | Hvit pusset villa, 9 × 8 m, to etasjer, flatt tak. Store vinduer, smalt vindu ved inngangen, skyvedør bak. |
| `tegl-valm` | Teglbungalow, 13 × 8 m, én etasje, valmtak 25°. Lang og lav, mange vinduer på forsiden. |
| `gult-l-hus` | Gult hus, 11 × 11 m, L-formet: to etasjer med saltak og en fløy i én etasje foran til høyre. Fasader med flere vegger på ulik dybde. |

Hvert hus har `fasit.json` (husets JSON i samme skjema som appen) og `bilder/`. Bildene er tegnet fra fasiten med appens egen 3D-scene: fire fasader, to skrå bilder utenfra (ett ovenfra, så taket synes) og to–tre bilder inne. De er derfor ikke ekte fotografier: de er rene og uten trær, biler og skygger fra naboer. Eval-en måler om modellen leser fasader, tak og åpninger riktig, ikke om den takler støyen i ekte bilder.

## Legg til et hus

**Med ekte bilder:** lag `eval/hus/<navn>/bilder/` med 5–30 bilder (lang side ca. 1280 px, som appen krymper til, og under 5 MB hver) og skriv `fasit.json`. Fasiten trenger bare det som sammenlignes: yttervegger med dører og vinduer i hver etasje, rom (for arealet) og taket. Koordinatene følger prompten: inngangsfasaden har størst z, venstre side ligger ved x = 0, sett utenfra mot inngangen. Enkleste vei: åpne huset i appen, rett det til det stemmer med huset, og eksporter JSON.

**Tegnet fra en fasit:** lag `eval/hus/<navn>/fasit.json` og kjør

```bash
npm run eval:bilder -- <navn>
```

Det krever Playwright med Chromium (`npm i -D playwright`, så `npx playwright install chromium`). Three.js hentes fra cdn.jsdelivr.net som i appen. Uten nett: `npm i -D three@0.170.0`. Hus med ekte bilder røres ikke (tegnede bilder kjennes på filen `bilder/.tegnet`).

## Filer

- `kjor.mjs`: kjører tolkningene og skriver rapporten.
- `mal.mjs`: måler et hus (`measure`), sammenligner med fasiten (`compare`) og lager forslagene (`suggest`). Hver fasadevegg plasseres etter retningen utsiden vender mot. Passer dørene og vinduene klart bedre når huset dreies eller speilvendes, meldes det som forvekslede fasader.
- `tegn.mjs` og `tegn.html`: tegner bildene fra fasiten.
