// Urgencia + notificaciones (campana) + dashboard de administración, de punta a punta.
import { expect, test } from '@playwright/test';
import { cerrarSesion, escribirEnEditor, iniciarSesion } from './ayudas';

test('ticket crítico → aviso al admin → dashboard → atenderlo → aviso al solicitante', async ({ page }) => {
  // ---------------------------------------------------------------- Solicitante: ticket con urgencia crítica
  await iniciarSesion(page, 'usuario_uno');
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  const ventana = page.getByRole('dialog', { name: 'Nuevo ticket de soporte' });
  await ventana.getByLabel('Tipo de solicitud').selectOption({ label: 'Consulta General' });
  // Por omisión la urgencia es Media.
  await expect(ventana.getByRole('radio', { name: 'Media' })).toBeChecked();
  await ventana.getByText('Crítica', { exact: true }).click();
  await expect(ventana.getByRole('radio', { name: 'Crítica' })).toBeChecked();
  await ventana.getByLabel(/^Concepto/).fill('Servidor de facturación caído');
  await escribirEnEditor(page, 'nt-desc', 'No podemos facturar desde las 9 a. m.');
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  const folio = (await page.getByRole('dialog', { name: 'Ticket creado' }).locator('.folio').textContent())!.trim();
  await page.getByRole('button', { name: 'Ver ticket' }).click();
  const detalle = page.getByRole('region', { name: 'Detalle del ticket' });
  await expect(detalle.locator('.urg').filter({ hasText: 'Crítica' })).toBeVisible();
  await cerrarSesion(page);

  // ---------------------------------------------------------------- Admin: campana + dashboard
  await iniciarSesion(page, 'admin_prueba');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const campana = page.getByRole('button', { name: /Notificaciones: \d+ sin leer/ });
  await expect(campana).toBeVisible();

  // Tarjeta "Críticos sin atender" → filtra la tabla.
  await page.locator('.tarjeta').filter({ hasText: 'Críticos sin atender' }).click();
  const fila = page.getByRole('row').filter({ hasText: folio });
  await expect(fila).toBeVisible();
  await expect(fila.locator('.urg')).toHaveText(/Crítica/);
  await expect(page.getByLabel('Urgencia', { exact: true })).toHaveValue('CRITICA');

  // Gráfica por urgencia: la barra de Crítica dice cuántos hay.
  await expect(page.getByRole('listitem', { name: /Crítica: \d+ tickets? abiertos?/ })).toBeVisible();

  // Campana → notificación del ticket nuevo → abre el ticket.
  await campana.click();
  const aviso = page.getByRole('dialog', { name: 'Notificaciones' }).getByRole('link', { name: new RegExp(`Nuevo ticket ${folio}`) });
  await expect(aviso).toBeVisible();
  await aviso.click();
  await expect(page).toHaveURL(new RegExp('/tickets/\\d+'));
  await expect(detalle.getByText(folio).first()).toBeVisible();
  await detalle.getByRole('button', { name: 'Tomar ticket' }).click();
  await expect(page.getByText(`Tomaste el ticket ${folio}.`)).toBeVisible();
  await cerrarSesion(page);

  // ---------------------------------------------------------------- Solicitante: aviso de que lo tomaron
  await iniciarSesion(page, 'usuario_uno');
  await page.getByRole('button', { name: /Notificaciones: \d+ sin leer/ }).click();
  const tomado = page.getByRole('dialog', { name: 'Notificaciones' }).getByRole('link', { name: new RegExp(`tomó tu ticket ${folio}`) });
  await expect(tomado).toBeVisible();
  await page.getByRole('button', { name: 'Marcar todas como leídas' }).click();
  await expect(page.getByRole('button', { name: 'Notificaciones', exact: true })).toBeVisible();
});

test('un solicitante no puede entrar al dashboard ni ve su enlace', async ({ page }) => {
  await iniciarSesion(page, 'usuario_uno');
  await expect(page.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: /Dashboard/ })).toHaveCount(0);
  await page.goto('/panel');
  await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible();
});
