// Menú lateral colapsable: contraer a íconos (se recuerda) en pantalla ancha y menú desplegable en celular.
import { expect, test } from '@playwright/test';
import { iniciarSesion } from './ayudas';

test('pantalla ancha: contraer a solo íconos, se recuerda al recargar y se vuelve a expandir', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await iniciarSesion(page, 'admin_prueba');
  const lateral = page.locator('.side');
  const tickets = page.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: /Tickets/ });
  await expect.poll(async () => (await lateral.boundingBox())!.width).toBe(248);

  await page.getByRole('button', { name: 'Contraer menú' }).click();
  await expect.poll(async () => (await lateral.boundingBox())!.width).toBe(76);
  // Sigue siendo navegable y con nombre accesible; el texto aparece al pasar el cursor.
  await expect(tickets).toHaveAttribute('title', 'Tickets');
  await tickets.click();
  await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await lateral.boundingBox())!.width).toBe(76);

  await page.getByRole('button', { name: 'Expandir menú' }).click();
  await expect.poll(async () => (await lateral.boundingBox())!.width).toBe(248);
  await expect(tickets).not.toHaveAttribute('title');
});

test('celular: el menú se despliega con el botón y se cierra al elegir una opción', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await iniciarSesion(page, 'usuario_uno');
  const tickets = page.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: /Mis tickets/ });
  await expect(page.getByRole('button', { name: 'Contraer menú' })).toBeHidden();
  await expect(tickets).not.toBeInViewport();

  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await expect(tickets).toBeInViewport();

  await tickets.click();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
  await expect(tickets).not.toBeInViewport();
});
