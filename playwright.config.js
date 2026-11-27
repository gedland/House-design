// Ende-til-ende-test av hele flyten: bilder inn → falsk tolkning → 3D-modell → redigering → lagret etter omlasting.
// Kjør med npm test. Første gang på en ny maskin: npx playwright install chromium
const { defineConfig, devices } = require('@playwright/test');
const PORT = 4173;

module.exports = defineConfig({
  testDir: 'test',
  // 3D-visningen tegnes i programvare (SwiftShader) i hodeløs Chromium, så hver test tar under ett minutt alene.
  // Flere nettlesere samtidig deler CPU-en og gjør alle tregere, derfor én om gangen og god tid.
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block', // ellers kan service-workeren servere gamle filer mellom testene
    trace: 'off',
    locale: 'nb-NO',
  },
  // Mobil først: testen kjører på en telefonskjerm.
  projects: [{ name: 'mobil', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'node test/fake-server.js',
    url: `http://127.0.0.1:${PORT}/api/status`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
