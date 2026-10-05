// Recorrido completo: iniciar sesión → crear ticket → verlo como admin → tomarlo → responder → cerrar → correo en la cola.
import { expect, test } from '@playwright/test';
import { cerrarSesion, escribirEnEditor, iniciarSesion } from './ayudas';

test('ciclo de vida completo de un ticket', async ({ page }) => {
  // ---------------------------------------------------------------- Solicitante crea el ticket
  await iniciarSesion(page, 'usuario_uno');
  await expect(page.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  const ventana = page.getByRole('dialog', { name: 'Nuevo ticket de soporte' });
  await expect(ventana.getByText('Selecciona un tipo de solicitud para continuar')).toBeVisible();
  await ventana.getByLabel('Tipo de solicitud').selectOption({ label: 'Cancelación' });
  await expect(ventana.getByText('Detalle de la cancelación')).toBeVisible();
  // Solo tiene una empresa asignada: viene preseleccionada.
  await expect(ventana.getByLabel('Empresa')).toHaveValue(/\d+/);
  await ventana.getByLabel(/^Módulo/).selectOption({ label: 'Compras' });

  // Enviar sin los campos obligatorios muestra los errores junto a cada campo.
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  await expect(ventana.getByText('Escribe el concepto.')).toBeVisible();

  await ventana.getByLabel(/^Concepto/).fill('CARTA PORTE');
  await ventana.getByLabel(/^Folio\(s\)/).fill('B12345');
  await escribirEnEditor(page, 'nt-desc', 'Buenos días, me pueden ayudar a cancelar la carta porte B12345.');
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();

  const confirmacion = page.getByRole('dialog', { name: 'Ticket creado' });
  await expect(confirmacion).toBeVisible();
  const folio = (await confirmacion.locator('.folio').textContent())!.trim();
  // Formato DEPTO-AÑO-CONSECUTIVO; el departamento del usuario viene preseleccionado (SIS).
  expect(folio).toMatch(/^SIS-\d{4}-\d{4,}$/);
  await expect(confirmacion.getByText(/Enviamos una copia a usuario_uno@prueba\.local/)).toBeVisible();
  await confirmacion.getByRole('button', { name: 'Ver ticket' }).click();

  const detalle = page.getByRole('region', { name: 'Detalle del ticket' });
  await expect(detalle.getByText(folio).first()).toBeVisible();
  await expect(detalle.getByText('Esperando que soporte tome tu ticket')).toBeVisible();
  await cerrarSesion(page);

  // ---------------------------------------------------------------- Soporte lo atiende
  await iniciarSesion(page, 'admin_prueba');
  // Los admins entran al dashboard; la bandeja está en el menú "Tickets".
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('link', { name: /^Tickets/ }).click();
  await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
  await page.getByLabel('Buscar tickets').fill(folio);
  await page.getByRole('button', { name: new RegExp(folio) }).click();

  await expect(detalle.getByText('Toma el ticket para poder responder o cerrarlo.')).toBeVisible();
  await detalle.getByRole('button', { name: 'Tomar ticket' }).click();
  await expect(page.getByText(`Tomaste el ticket ${folio}.`)).toBeVisible();
  await expect(detalle.locator('.pill').filter({ hasText: 'En proceso' }).first()).toBeVisible();

  await escribirEnEditor(page, `redactar-respuesta-${page.url().split('/').pop()!.split('?')[0]}`, 'Ya lo estoy revisando.');
  await detalle.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText('Respuesta enviada.')).toBeVisible();
  await expect(detalle.locator('.msg.sup').getByText('Ya lo estoy revisando.')).toBeVisible();

  await detalle.getByRole('button', { name: 'Cerrar ticket' }).click();
  const cierre = page.getByRole('dialog', { name: `Cerrar ${folio}` });
  await cierre.getByRole('button', { name: 'Cerrar ticket' }).click();
  await expect(cierre.getByText('La resolución es obligatoria para cerrar el ticket.')).toBeVisible();
  await escribirEnEditor(page, `resolucion-${page.url().split('/').pop()!.split('?')[0]}`, 'Carta porte cancelada y reemplazada.');
  await cierre.getByRole('button', { name: 'Cerrar ticket' }).click();
  await expect(page.getByText(`Ticket ${folio} cerrado.`)).toBeVisible();
  await expect(detalle.locator('.pill').filter({ hasText: 'Completado' }).first()).toBeVisible();

  // Historial con quién hizo qué.
  await detalle.getByRole('button', { name: 'Ver historial' }).click();
  const historial = detalle.locator('.linea-tiempo');
  for (const texto of ['creó el ticket', 'tomó el ticket', 'respondió', 'cerró el ticket']) {
    await expect(historial.getByText(texto)).toBeVisible();
  }

  // ---------------------------------------------------------------- El correo de cierre está en la cola
  await page.getByRole('link', { name: /Correos/ }).click();
  const fila = page.getByRole('row').filter({ hasText: `[${folio}] Ticket cerrado` });
  await expect(fila).toBeVisible();
  await expect(fila.getByText('usuario_uno@prueba.local')).toBeVisible();
  // El trabajador lo envía en segundos (modo consola en pruebas).
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: `[${folio}] Ticket cerrado` }).getByText('Enviado')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await cerrarSesion(page);

  // ---------------------------------------------------------------- El solicitante ve la resolución
  await iniciarSesion(page, 'usuario_uno');
  await page.getByRole('button', { name: new RegExp(folio) }).click();
  await expect(detalle.getByText('Carta porte cancelada y reemplazada.')).toBeVisible();
  await expect(detalle.getByText('Resolución')).toBeVisible();
  // Completado: ya no hay caja para comentar.
  await expect(detalle.getByLabel('Agregar un comentario')).toHaveCount(0);
});

test('"Enviar copia a" acepta varios correos separados por coma y no deja pasar uno mal escrito', async ({
  page,
}) => {
  await iniciarSesion(page, 'usuario_uno');
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  const ventana = page.getByRole('dialog', { name: 'Nuevo ticket de soporte' });
  await ventana.getByLabel('Tipo de solicitud').selectOption({ label: 'Cancelación' });
  await ventana.getByLabel(/^Módulo/).selectOption({ label: 'Compras' });
  await ventana.getByLabel(/^Concepto/).fill('CARTA PORTE');
  await ventana.getByLabel(/^Folio\(s\)/).fill('B999');
  await escribirEnEditor(page, 'nt-desc', 'Prueba de copias.');
  await expect(
    ventana.getByText('El equipo de sistemas siempre recibe el ticket automáticamente.', { exact: false }),
  ).toBeVisible();

  // Un correo mal escrito se queda en el cuadro y bloquea el envío.
  const copia = ventana.getByLabel('Enviar copia a (opcional)');
  await copia.fill('uno@prueba.local, dos-sin-arroba');
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  await expect(
    ventana.getByText('"dos-sin-arroba" no es un correo válido. Corrígelo o bórralo.'),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Ticket creado' })).toBeHidden();

  // Corregido (y sin pulsar Enter): se agrega al salir del cuadro y el ticket se crea con ambas copias.
  await copia.fill('dos@prueba.local');
  // Salir del cuadro también cierra las sugerencias (coincide con usuario_dos), que si no tapan el botón.
  await copia.blur();
  await expect(ventana.locator('button[role="option"]')).toHaveCount(0);
  await ventana.getByRole('button', { name: 'Crear ticket' }).click();
  const confirmacion = page.getByRole('dialog', { name: 'Ticket creado' });
  await expect(confirmacion.getByText(/y a los contactos en copia/)).toBeVisible();
  await confirmacion.getByRole('button', { name: 'Ver ticket' }).click();
  await expect(page.getByText('En copia: uno@prueba.local, dos@prueba.local')).toBeVisible();
});
