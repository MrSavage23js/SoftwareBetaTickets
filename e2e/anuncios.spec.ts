// Anuncios: un usuario con la sesión ya abierta recibe el banner sin recargar la página.
import { expect, test, type Browser } from '@playwright/test';
import { iniciarSesion, PASSWORD } from './ayudas';

/** El admin manda anuncios directo por la API (más rápido que llenar el formulario). */
async function mandarAnuncios(browser: Browser, anuncios: { titulo: string; mensaje: string; tipo: string }[], retirarAnteriores = false) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/auth/login', { data: { username: 'admin_prueba', password: PASSWORD } });
  const csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
  // La BD no se reinicia entre pruebas: se retiran los que hayan quedado visibles.
  if (retirarAnteriores) {
    const activos = ((await (await ctx.request.get('/api/anuncios')).json()) as { id: number; activo: boolean }[]).filter((a) => a.activo);
    for (const a of activos) await ctx.request.post(`/api/anuncios/${a.id}/retirar`, { headers: { 'X-CSRF-Token': csrf } });
  }
  for (const a of anuncios) {
    expect((await ctx.request.post('/api/anuncios', { data: a, headers: { 'X-CSRF-Token': csrf } })).status()).toBe(201);
  }
  await ctx.close();
}

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

test('varios anuncios: se ve uno a la vez, urgentes primero, y se recorren con ‹ ›', async ({ browser, page }) => {
  await mandarAnuncios(browser, [
    { titulo: 'Recordatorio', mensaje: 'Adjunten captura al levantar un ticket.', tipo: 'INFO' },
    { titulo: 'Correo caído', mensaje: 'Ya lo estamos revisando.', tipo: 'URGENTE' },
  ], true);
  await iniciarSesion(page, 'usuario_dos');
  const banner = page.getByRole('region', { name: 'Anuncios' });
  await expect(banner.getByText('Correo caído')).toBeVisible();
  await expect(banner.getByText('Recordatorio')).toHaveCount(0);
  await expect(banner.getByText('1 de 2')).toBeVisible();
  // El urgente no se puede cerrar.
  await expect(banner.getByRole('button', { name: /Cerrar anuncio/ })).toHaveCount(0);

  await banner.getByRole('button', { name: 'Anuncio siguiente' }).click();
  await expect(banner.getByText('Recordatorio')).toBeVisible();
  await expect(banner.getByText('2 de 2')).toBeVisible();

  // Al cerrar el informativo queda solo el urgente, sin flechas.
  await banner.getByRole('button', { name: 'Cerrar anuncio: Recordatorio' }).click();
  await expect(banner.getByText('Correo caído')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Anuncio siguiente' })).toHaveCount(0);

  // Si llega uno nuevo mientras está dentro, salta a él.
  await mandarAnuncios(browser, [{ titulo: 'Junta mañana', mensaje: 'A las 10:00.', tipo: 'ADVERTENCIA' }]);
  await expect(banner.getByText('Junta mañana')).toBeVisible({ timeout: 20_000 });
  await expect(banner.getByText('2 de 2')).toBeVisible();
});
