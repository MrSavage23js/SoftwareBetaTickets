// Anuncios: un usuario con la sesión ya abierta recibe el banner sin recargar la página.
import { expect, test } from '@playwright/test';
import { iniciarSesion } from './ayudas';

test('el usuario que ya está dentro ve el anuncio en cuanto el admin lo manda', async ({ browser }) => {
  const usuario = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // El usuario entra primero y se queda en su pantalla.
  await iniciarSesion(usuario, 'usuario_uno');
  await expect(usuario.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();
  const banner = usuario.getByRole('region', { name: 'Anuncios' });
  await expect(banner).toHaveCount(0);

  // Después, el admin manda un anuncio para todos.
  await iniciarSesion(admin, 'admin_prueba');
  await admin.getByRole('link', { name: 'Anuncios' }).click();
  await admin.getByRole('button', { name: 'Mandar anuncio' }).click();
  const ventana = admin.getByRole('dialog', { name: 'Mandar anuncio' });
  await ventana.getByLabel('Título').fill('Mantenimiento');
  await ventana.getByLabel('Mensaje').fill('El sábado no habrá sistema.');
  await ventana.getByRole('button', { name: 'Mandar ahora' }).click();
  await expect(admin.getByRole('row').filter({ hasText: 'Mantenimiento' })).toBeVisible();

  // Sin recargar: debe llegarle en pocos segundos.
  await expect(banner.getByText('Mantenimiento')).toBeVisible({ timeout: 20_000 });

  // Lo cierra y al retirarlo/recargar no vuelve.
  await banner.getByRole('button', { name: /Cerrar anuncio/ }).click();
  await expect(banner).toHaveCount(0);
  await usuario.reload();
  await expect(usuario.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();
  await expect(usuario.getByRole('region', { name: 'Anuncios' })).toHaveCount(0);
});
