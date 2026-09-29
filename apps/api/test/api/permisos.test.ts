// Acceso denegado en TODOS los endpoints protegidos: sin sesión → 401; con rol sin permiso → 403.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { anonimo, entrar, reiniciarBD, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let usuario: Cliente;
beforeAll(async () => {
  f = await reiniciarBD();
  usuario = await entrar('usuario_uno');
});
afterAll(async () => {
  await db.destroy();
});

type Metodo = 'get' | 'post' | 'put' | 'delete';
const SOLO_ADMIN: [Metodo, string][] = [
  ['get', '/usuarios'],
  ['get', '/usuarios/1'],
  ['get', '/usuarios/roles'],
  ['post', '/usuarios'],
  ['put', '/usuarios/1'],
  ['delete', '/usuarios/1'],
  ['post', '/usuarios/1/cerrar-sesion'],
  ['post', '/catalogos/empresas'],
  ['put', '/catalogos/empresas/1'],
  ['post', '/catalogos/tipos'],
  ['put', '/catalogos/tipos/1'],
  ['post', '/catalogos/modulos'],
  ['put', '/catalogos/modulos/1'],
  ['get', '/correos'],
  ['post', '/correos/1/reintentar'],
  ['get', '/correos/plantillas'],
  ['put', '/correos/plantillas/1'],
  ['post', '/correos/plantillas/vista-previa'],
  ['get', '/ajustes'],
  ['put', '/ajustes'],
  ['get', '/tickets/1/historial'],
];

const CON_SESION: [Metodo, string][] = [
  ...SOLO_ADMIN,
  ['get', '/auth/yo'],
  ['get', '/tickets'],
  ['post', '/tickets'],
  ['get', '/tickets/1'],
  ['post', '/tickets/1/tomar'],
  ['post', '/tickets/1/comentarios'],
  ['get', '/catalogos'],
  ['get', '/usuarios/contactos?q=ab'],
  ['get', '/usuarios/tecnicos'],
  ['post', '/adjuntos/temporal'],
  ['get', '/adjuntos/0b1f5a2c-3d4e-4f60-8a9b-0c1d2e3f4a5b'],
];

describe('sin sesión → 401', () => {
  it.each(CON_SESION)('%s %s', async (m, ruta) => {
    const r = await anonimo()[m](`/api${ruta}`).send({});
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('NO_AUTENTICADO');
  });
});

describe('usuario solicitante en endpoints de admin → 403', () => {
  it.each(SOLO_ADMIN)('%s %s', async (m, ruta) => {
    const r = await usuario.agente[m](`/api${ruta}`).set('X-CSRF-Token', usuario.csrf).send({});
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('PROHIBIDO');
  });
});

describe('rutas inexistentes', () => {
  it('404 con formato de error de la API', async () => {
    const r = await usuario.get('/no-existe');
    expect(r.status).toBe(404);
    expect(r.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('ids no numéricos → 404 (no 500)', async () => {
    const admin = await entrar('admin_prueba');
    for (const ruta of ['/tickets/abc', '/tickets/1e99', '/usuarios/-1', '/tickets/99999999']) {
      expect((await admin.get(ruta)).status).toBe(404);
    }
  });

  it('los errores nunca exponen trazas ni SQL', async () => {
    const r = await usuario.get(`/tickets?pagina=abc&estatus=<script>`);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/at |SELECT|node_modules/);
    void f;
  });
});
