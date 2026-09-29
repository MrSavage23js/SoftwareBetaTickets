// Recorrido completo de la DEMO de GitHub Pages (sin servidor), servida bajo una subruta como en Pages.
// Ejecutar: npm run build:demo && npx playwright test --config e2e/demo/playwright.demo.config.ts
import { expect, test, type Page } from '@playwright/test';

async function entrar(page: Page, usuario: string) {
  await page.goto('./');
  await page.getByRole('button', { name: new RegExp(`^${usuario}`) }).click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('la demo funciona sin servidor: crear, atender y cerrar un ticket', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Reiniciar datos de la demo' }).click();

  // Solicitante crea un ticket.
  await entrar(page, 'laura');
  await expect(page.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  const ventana = page.getByRole('dialog', { name: 'Nuevo ticket de soporte' });
  await ventana.getByLabel('Tipo de solicitud').selectOption({ label: 'Corrección' });
  await ventana.getByLabel('Empresa').selectOption({ label: 'Maquila Aramo' });
  await ventana.getByLabel(/^Módulo/).selectOption({ label: 'Ventas' });
  await ventana.getByLabel(/^Concepto/).fill('Factura duplicada');
  await ventana.getByLabel(/^Folio\(s\)/).fill('F-2001');
  await page.locator('#nt-desc').click();
  await page.keyboard.type('La factura F-2001 salió dos veces.');
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  const folio = (await page.getByRole('dialog', { name: 'Ticket creado' }).locator('.folio').textContent())!.trim();
  expect(folio).toBe('MACO-0002');
  await page.getByRole('button', { name: 'Ver ticket' }).click();
  await page.screenshot({ path: 'test-results/demo-1-solicitante.png', fullPage: true });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  // Soporte lo atiende.
  await entrar(page, 'admin');
  await page.getByLabel('Buscar tickets').fill(folio);
  await page.getByRole('button', { name: new RegExp(folio) }).click();
  const detalle = page.getByRole('region', { name: 'Detalle del ticket' });
  await detalle.getByRole('button', { name: 'Tomar ticket' }).click();
  await expect(detalle.locator('.pill').filter({ hasText: 'En proceso' }).first()).toBeVisible();
  await page.locator('[id^="redactar-respuesta-"]').click();
  await page.keyboard.type('Ya la estoy revisando.');
  await detalle.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText('Respuesta enviada.')).toBeVisible();
  await detalle.getByRole('button', { name: 'Cerrar ticket' }).click();
  await page.locator('[id^="resolucion-"]').click();
  await page.keyboard.type('Se canceló la factura duplicada.');
  await page.getByRole('dialog', { name: `Cerrar ${folio}` }).getByRole('button', { name: 'Cerrar ticket' }).click();
  await expect(detalle.locator('.pill').filter({ hasText: 'Completado' }).first()).toBeVisible();

  // Kanban y correos.
  await page.getByRole('button', { name: 'Kanban' }).click();
  await expect(page.getByRole('region', { name: 'Completado' }).getByText(folio)).toBeVisible();
  await page.screenshot({ path: 'test-results/demo-2-kanban.png', fullPage: true });
  await page.getByRole('link', { name: /Correos/ }).click();
  await expect(page.getByRole('row').filter({ hasText: `Ticket ${folio} cerrado` })).toBeVisible();

  // Los datos sobreviven a recargar la página.
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: `Ticket ${folio} cerrado` })).toBeVisible();
});
