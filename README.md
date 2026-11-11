# Husform

1. Skaff en API-nøkkel hos Higgsfield (cloud.higgsfield.ai → API Keys). Du får en nøkkel-ID og en hemmelighet.
2. Start med nøkkelen i miljøvariabelen: `IMAGE_API_KEY="<nøkkel-id>:<hemmelighet>" node server.js`
3. Åpne http://localhost:3000. Nøkkelen ligger bare i miljøet på serveren, aldri i nettleseren eller repoet.

## Merknader

- Modell: Seedream 4 (`bytedance/seedream/v4/edit`) med bildereferanse, som beholder form og vinkel. Bytt med `IMAGE_MODEL_EDIT` og `IMAGE_MODEL_CREATE`. Port: `PORT`.
- Maskering: modellen har ikke maskeinngang. Appen sender derfor originalen pluss en kopi der området er markert i rødt, og ber i prompten om endring bare der. Etterpå limes resultatet inn i originalen kun innenfor markeringen, så resten av bildet er garantert urørt. Masken sendes også som `mask` i forespørselen, klar for en modell som støtter den.
- Uten nøkkel, eller uten server, kjører appen i demomodus med plassholderbilder.
- Bilder og versjoner lagres i nettleseren (IndexedDB). «Slett alt» tømmer lageret.
- Kallet mot Higgsfield er skrevet etter API-et slik det er dokumentert, men er ikke kjørt mot ekte tjeneste (ingen nøkkel her). Feil derfra vises i statusfeltet.

## Video (Seedance 2.5)

1. `npm install`
2. Lag `.env.local` i prosjektmappen med én linje: `HF_CREDENTIALS=<nøkkel-id>:<hemmelighet>` (filen er ignorert av Git).
3. `npm run video` lager en 5 sekunders 720p-video (16:9) og skriver ut video-URL-en. Dette koster kreditter.
