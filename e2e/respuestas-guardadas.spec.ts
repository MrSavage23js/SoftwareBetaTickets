// Respuestas guardadas: el técnico guarda un texto una vez y lo inserta con un clic al responder.
import { expect, test, type Page } from '@playwright/test';
import { cerrarSesion, escribirEnEditor, iniciarSesion } from './ayudas';

async function crearTicket(page: Page): Promise<string> {
  await iniciarSesion(page, 'usuario_dos');
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  const ventana = page.getByRole('dialog', { name: 'Nuevo ticket de soporte' });
  await ventana.getByLabel('Tipo de solicitud').selectOption({ label: 'Cancelación' });
  await ventana.getByLabel(/^Módulo/).selectOption({ label: 'Compras' });
  await ventana.getByLabel(/^Concepto/).fill('FACTURA');
  await ventana.getByLabel(/^Folio\(s\)/).fill('A777');
  await escribirEnEditor(page, 'nt-desc', 'No puedo cancelar la factura A777.');
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  const confirmacion = page.getByRole('dialog', { name: 'Ticket creado' });
  const folio = (await confirmacion.locator('.folio').textContent())!.trim();
  await confirmacion.getByRole('button', { name: 'Cerrar' }).first().click();
  await cerrarSesion(page);
  return folio;
}

test('guardar una respuesta e insertarla al responder', async ({ page }) => {
  const folio = await crearTicket(page);

  await iniciarSesion(page, 'admin_prueba');
  await page.getByRole('link', { name: /^Tickets/ }).click();
  await page.getByLabel('Buscar tickets').fill(folio);
  await page.getByRole('button', { name: new RegExp(folio) }).click();
  const detalle = page.getByRole('region', { name: 'Detalle del ticket' });
  await detalle.getByRole('button', { name: 'Tomar ticket' }).click();
  await expect(detalle.locator('.pill').filter({ hasText: 'En proceso' }).first()).toBeVisible();

  await detalle.getByRole('button', { name: 'Respuestas' }).click();
  const ventana = page.getByRole('dialog', { name: 'Respuestas guardadas' });
  await expect(ventana.getByText('Aún no tienes respuestas guardadas')).toBeVisible();
  await ventana.getByRole('button', { name: 'Nueva respuesta' }).click();

  const nueva = page.getByRole('dialog', { name: 'Nueva respuesta guardada' });
  await nueva.getByLabel('Título').fill('Factura cancelada');
  await escribirEnEditor(page, 'resp-texto', 'Listo, la factura ya quedó cancelada en el SAT.');
  await nueva.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Respuesta guardada.')).toBeVisible();

  await ventana.getByRole('button', { name: /^Factura cancelada/ }).click();
  await expect(ventana).toBeHidden();
  const id = page.url().split('/').pop()!.split('?')[0];
  await expect(page.locator(`#redactar-respuesta-${id}`)).toContainText(
    'la factura ya quedó cancelada en el SAT',
  );
  await detalle.getByRole('button', { name: 'Responder' }).click();
  await expect(
    detalle.locator('.msg.sup').filter({ hasText: 'la factura ya quedó cancelada' }),
  ).toBeVisible();
});
