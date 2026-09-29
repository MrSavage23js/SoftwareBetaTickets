import { defineConfig, devices } from '@playwright/test';

// Recorridos completos en navegador. Usan la BD de pruebas (se reinicia al arrancar) y la API en :3101.
// Ejecutar:  npm run test:e2e          (E2E_COMPILAR=1 para recompilar la web antes)
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3101',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/e2e-servidor.mjs',
    url: 'http://localhost:3101/health',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
