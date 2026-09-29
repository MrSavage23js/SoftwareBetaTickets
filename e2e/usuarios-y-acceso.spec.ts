import { expect, test } from '@playwright/test';
import { iniciarSesion } from './ayudas';

test('alta, edición, cierre de sesión y baja de un usuario', async ({ page, browser }) => {
  await iniciarSesion(page, 'admin_prueba');
  await page.getByRole('link', { name: /Usuarios/ }).click();
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible();

  // ---------------------------------------------------------------- Alta
  await page.getByRole('button', { name: 'Agregar usuario' }).click();
  const alta = page.getByRole('dialog', { name: 'Nuevo usuario' });
  await alta.getByLabel('Nombre de usuario').fill('Elena_Vargas');
  await alta.getByLabel('Correo electrónico').fill('marta@prueba.local');
  await alta.getByLabel('Contraseña', { exact: true }).fill('Temporal123');
  await alta.getByLabel('Confirmar contraseña').fill('Otra00000');
  await alta.getByRole('button', { name: 'Registrar usuario' }).click();
  await expect(alta.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await alta.getByLabel('Confirmar contraseña').fill('Temporal123');
  await alta.getByRole('checkbox', { name: 'Autotransportes Asturcones' }).check();
  await alta.getByRole('checkbox', { name: 'Maquila Aramo', exact: true }).check();
  await alta.getByRole('button', { name: 'Registrar usuario' }).click();
  await expect(page.getByText('Usuario Elena_Vargas registrado.')).toBeVisible();

  const fila = page.getByRole('row').filter({ hasText: 'Elena_Vargas' });
  await expect(fila.getByText('2 empresas')).toBeVisible();
  await expect(fila.getByText('Nunca')).toBeVisible();
  await expect(fila.getByText('Desconectado')).toBeVisible();

  // ---------------------------------------------------------------- Edición
  await fila.getByRole('button', { name: 'Editar Elena_Vargas' }).click();
  const edicion = page.getByRole('dialog', { name: 'Editar Elena_Vargas' });
  await edicion.getByLabel('Nombre completo (opcional)').fill('Elena Vargas');
  await edicion.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Usuario Elena_Vargas actualizado.')).toBeVisible();
  await expect(fila.getByText(/Elena Vargas ·/)).toBeVisible();

  // ---------------------------------------------------------------- La nueva usuaria entra (y debe cambiar su contraseña)
  const otra = await browser.newContext();
  const marta = await otra.newPage();
  await iniciarSesion(marta, 'Elena_Vargas', 'Temporal123');
  await expect(marta.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible();
  await marta.getByLabel('Contraseña actual').fill('Temporal123');
  await marta.getByLabel('Contraseña nueva', { exact: true }).fill('MiClave2026');
  await marta.getByLabel('Confirmar contraseña nueva').fill('MiClave2026');
  await marta.getByRole('button', { name: 'Cambiar contraseña y entrar' }).click();
  await expect(marta.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();

  // ---------------------------------------------------------------- El admin la ve en línea y le cierra la sesión
  await page.reload();
  await expect(fila.getByText('En línea')).toBeVisible();
  await fila.getByRole('button', { name: 'Cerrar sesión de Elena_Vargas' }).click();
  await page.getByRole('dialog', { name: 'Cerrar sesión' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByText('Se cerró la sesión de Elena_Vargas.')).toBeVisible();
  await expect(fila.getByText('Desconectado')).toBeVisible();

  // En su siguiente acción, Marta regresa a la pantalla de inicio con el aviso.
  await marta.getByRole('button', { name: 'Nuevo ticket' }).first().click();
  await expect(marta.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: 15_000 });
  await expect(marta.getByText(/sesión fue cerrada|sesión terminó/)).toBeVisible();
  await otra.close();

  // ---------------------------------------------------------------- Baja (con confirmación)
  await fila.getByRole('button', { name: 'Eliminar Elena_Vargas' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Eliminar usuario' });
  await expect(confirmar.getByText('Sus tickets se conservan')).toBeVisible();
  await confirmar.getByRole('button', { name: 'Eliminar usuario' }).click();
  await expect(page.getByText('Usuario Elena_Vargas eliminado.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Elena_Vargas' })).toHaveCount(0);

  // Ya no puede entrar.
  const tercera = await browser.newContext();
  const intento = await tercera.newPage();
  await iniciarSesion(intento, 'Elena_Vargas', 'MiClave2026');
  await expect(intento.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
  await tercera.close();
});

test('un usuario solicitante no puede entrar a las pantallas de admin', async ({ page }) => {
  await iniciarSesion(page, 'usuario_uno');
  await expect(page.getByRole('heading', { name: 'Mis tickets' })).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Menú' });
  await expect(menu.getByRole('link', { name: /Mis tickets/ })).toBeVisible();
  for (const seccion of ['Usuarios', 'Catálogos', 'Correos', 'Ajustes']) {
    await expect(menu.getByRole('link', { name: new RegExp(seccion) })).toHaveCount(0);
  }

  for (const ruta of ['/usuarios', '/catalogos', '/correos', '/ajustes']) {
    await page.goto(ruta);
    await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible();
  }

  // Tampoco ve controles de soporte en la bandeja.
  await page.goto('/tickets');
  await expect(page.getByRole('button', { name: 'Kanban' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filtros' })).toHaveCount(0);
});

test('sin sesión cualquier pantalla lleva al inicio de sesión y regresa a donde iba', async ({ page }) => {
  await page.goto('/tickets?estatus=PENDIENTE');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page).toHaveURL(/\/inicio\?volver=/);
  await page.getByLabel('Nombre de usuario').fill('usuario_uno');
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();
  await page.getByLabel('Contraseña').fill('Prueba12345');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/tickets\?estatus=PENDIENTE/);
});

test('el retorno después de iniciar sesión nunca lleva a otro sitio', async ({ page }) => {
  for (const volver of ['//sitio-malo.com', '/\\sitio-malo.com', 'https://sitio-malo.com']) {
    await page.context().clearCookies();
    await page.goto(`/inicio?volver=${encodeURIComponent(volver)}`);
    await page.getByLabel('Nombre de usuario').fill('usuario_uno');
    await page.getByLabel('Contraseña').fill('Prueba12345');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL('http://localhost:3101/tickets');
  }
});
