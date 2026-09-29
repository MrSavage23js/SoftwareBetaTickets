import { defineConfig, devices } from '@playwright/test';

// Prueba la demo tal como la sirve GitHub Pages: archivos estáticos bajo una subruta.
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4174/Software-Tickets/', locale: 'es-MX', timezoneId: 'America/Mexico_City' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/servir-estatico.mjs demo-github-pages 4174 /Software-Tickets/',
    cwd: '../..',
    url: 'http://localhost:4174/Software-Tickets/',
    reuseExistingServer: false,
  },
});
