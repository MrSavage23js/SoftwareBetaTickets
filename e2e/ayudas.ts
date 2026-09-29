import { expect, type Page } from '@playwright/test';

/** Contraseña de los usuarios de prueba (apps/api/test/ayudas.ts). */
export const PASSWORD = 'Prueba12345';

export async function iniciarSesion(page: Page, usuario: string, password = PASSWORD) {
  await page.goto('/inicio');
  await page.getByLabel('Nombre de usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

export async function cerrarSesion(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

/** Escribe en un editor TipTap (contenteditable) por su id. */
export async function escribirEnEditor(page: Page, id: string, texto: string) {
  const editor = page.locator(`#${id}`);
  await editor.click();
  await page.keyboard.type(texto);
}
