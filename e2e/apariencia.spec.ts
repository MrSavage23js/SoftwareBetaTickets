// Apariencia: el usuario elige modo y paleta, se aplica al instante y se conserva al recargar y al volver a entrar.
import { expect, test } from '@playwright/test';
import { cerrarSesion, iniciarSesion } from './ayudas';

test('modo oscuro y paleta Bosque: se aplican al instante y se recuerdan', async ({ page }) => {
  await iniciarSesion(page, 'usuario_uno');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-acento');

  await page.getByRole('button', { name: 'Apariencia' }).click();
  const ventana = page.getByRole('dialog', { name: 'Apariencia' });
  await expect(ventana.getByRole('radio', { name: /Automático/ })).toHaveAttribute('aria-checked', 'true');
  await expect(ventana.getByRole('radio', { name: 'Aqua' })).toHaveAttribute('aria-checked', 'true');

  await ventana.getByRole('radio', { name: /Oscuro/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await ventana.getByRole('radio', { name: 'Bosque' }).click();
  await expect(html).toHaveAttribute('data-acento', 'bosque');
  await expect(ventana.getByRole('radio', { name: 'Bosque' })).toHaveAttribute('aria-checked', 'true');
  // El botón principal ya usa el verde de la paleta.
  await expect(ventana.getByRole('button', { name: 'Listo' })).toHaveCSS('color', 'rgb(5, 40, 18)');
  await ventana.getByRole('button', { name: 'Listo' }).click();

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-acento', 'bosque');

  // Se guardó en el usuario: en un navegador limpio vuelve con la sesión.
  await cerrarSesion(page);
  await page.evaluate(() => localStorage.clear());
  await iniciarSesion(page, 'usuario_uno');
  await expect(html).toHaveAttribute('data-acento', 'bosque');

  // De regreso a Automático + Aqua: sin atributos (el diseño original).
  await page.getByRole('button', { name: 'Apariencia' }).click();
  await ventana.getByRole('radio', { name: /Automático/ }).click();
  await expect(html).not.toHaveAttribute('data-theme');
  await ventana.getByRole('radio', { name: 'Aqua' }).click();
  await expect(html).not.toHaveAttribute('data-acento');
});
