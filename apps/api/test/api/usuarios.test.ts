import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { anonimo, entrar, PASSWORD, reiniciarBD, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let admin: Cliente;
let rolUsuario: number;
let rolAdmin: number;
beforeEach(async () => {
  f = await reiniciarBD();
  admin = await entrar('admin_prueba');
  const roles = (await admin.get('/usuarios/roles')).body as { id: number; codigo: string }[];
  rolUsuario = roles.find((r) => r.codigo === 'USUARIO')!.id;
  rolAdmin = roles.find((r) => r.codigo === 'ADMIN_SOPORTE')!.id;
});
afterAll(async () => {
  await db.destroy();
});

const nuevo = (extra: Record<string, unknown> = {}) => ({
  username: 'Sofia_Rios',
  nombre: 'Sofía Ríos',
  email: 'sofia@prueba.local',
  password: 'Inicial123',
  confirmarPassword: 'Inicial123',
  rolId: rolUsuario,
  empresaIds: [f.empresaAS, f.empresaMA],
  ...extra,
});

describe('listado', () => {
  it('muestra rol, empresas, "nunca" como último acceso y el estatus En línea real', async () => {
    const r = await admin.get('/usuarios');
    expect(r.status).toBe(200);
    const porNombre = Object.fromEntries((r.body as { username: string }[]).map((u) => [u.username, u]));
    expect(porNombre.admin_prueba).toMatchObject({ enLinea: true, rol: { codigo: 'ADMIN_SOPORTE' } });
    expect(porNombre.usuario_uno).toMatchObject({ enLinea: false, ultimoLoginAt: null, empresas: [{ nombre: 'Autotransportes Asturcones' }] });
    // Ningún dato sensible en la respuesta.
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
  });
});

describe('alta', () => {
  it('crea el usuario con sus empresas y queda auditado', async () => {
    const r = await admin.post('/usuarios', nuevo());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ username: 'Sofia_Rios', email: 'sofia@prueba.local', activo: true });
    expect(r.body.empresas).toHaveLength(2);
    const a = await db.selectFrom('auditoria').selectAll().where('accion', '=', 'CREADO').executeTakeFirstOrThrow();
    expect(JSON.stringify(a.datos)).not.toContain('Inicial123');
  });

  it.each([
    ['usuario duplicado', { username: 'usuario_uno' }, 409, null],
    ['usuario duplicado sin importar mayúsculas', { username: 'USUARIO_UNO' }, 409, null],
    ['contraseñas distintas', { confirmarPassword: 'Otra12345' }, 400, 'confirmarPassword'],
    ['correo inválido', { email: 'no-es-correo' }, 400, 'email'],
    ['contraseña débil', { password: 'abc', confirmarPassword: 'abc' }, 400, 'password'],
    ['usuario con espacios', { username: 'Sofia Rios' }, 400, 'username'],
    ['rol inexistente', { rolId: 9999 }, 400, 'rolId'],
    ['empresa inexistente', { empresaIds: [9999] }, 400, 'empresaIds'],
  ])('%s → %i', async (_n, cambio, estado, campo) => {
    const r = await admin.post('/usuarios', nuevo(cambio));
    expect(r.status).toBe(estado);
    if (campo) expect(r.body.error.campos).toHaveProperty(campo);
  });
});

describe('edición', () => {
  it('cambia empresas y rol; cerrar sus sesiones al cambiar el rol', async () => {
    const u1 = await entrar('usuario_uno');
    const r = await admin.put(`/usuarios/${f.u1}`, {
      username: 'usuario_uno',
      email: 'uno@prueba.local',
      rolId: rolAdmin,
      empresaIds: [f.empresaMA],
      activo: true,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ rol: { codigo: 'ADMIN_SOPORTE' }, empresas: [{ id: f.empresaMA }] });
    expect((await u1.get('/auth/yo')).status).toBe(401);
  });

  it('restablecer la contraseña de otro admin lo obliga a cambiarla; a un usuario no', async () => {
    await admin.put(`/usuarios/${f.tecnico}`, {
      username: 'tecnico_prueba',
      email: 'tecnico@prueba.local',
      rolId: rolAdmin,
      empresaIds: [],
      password: 'Reinicio123',
      confirmarPassword: 'Reinicio123',
    }).expect(200);
    const t = await entrar('tecnico_prueba', 'Reinicio123');
    expect((await t.get('/auth/yo')).body.usuario.debeCambiarPassword).toBe(true);

    await admin.put(`/usuarios/${f.u1}`, {
      username: 'usuario_uno',
      email: 'usuario_uno@prueba.local',
      rolId: rolUsuario,
      empresaIds: [f.empresaAS],
      password: 'Reinicio123',
      confirmarPassword: 'Reinicio123',
    }).expect(200);
    const c = await entrar('usuario_uno', 'Reinicio123');
    expect((await c.get('/auth/yo')).body.usuario.debeCambiarPassword).toBe(false);
  });

  it('sin contraseña no la cambia', async () => {
    await admin.put(`/usuarios/${f.u1}`, { username: 'usuario_uno', email: 'x@prueba.local', rolId: rolUsuario, empresaIds: [], password: '' }).expect(200);
    await entrar('usuario_uno', PASSWORD);
  });

  it('no se puede desactivar a uno mismo ni dejar el sistema sin administradores', async () => {
    const yo = await admin.put(`/usuarios/${f.admin}`, { username: 'admin_prueba', email: 'a@prueba.local', rolId: rolAdmin, activo: false });
    expect(yo.status).toBe(409);
    await admin.del(`/usuarios/${f.tecnico}`).expect(204);
    const ultimo = await admin.put(`/usuarios/${f.admin}`, { username: 'admin_prueba', email: 'a@prueba.local', rolId: rolUsuario });
    expect(ultimo.status).toBe(409);
    expect(ultimo.body.error.codigo).toBe('ULTIMO_ADMIN');
  });

  it('usuario inexistente → 404', async () => {
    expect((await admin.put('/usuarios/99999', { username: 'x_x', email: 'x@x.com', rolId: rolUsuario })).status).toBe(404);
  });
});

describe('cerrar sesión de otro usuario', () => {
  it('lo saca del sistema de inmediato', async () => {
    const u1 = await entrar('usuario_uno');
    const r = await admin.post(`/usuarios/${f.u1}/cerrar-sesion`);
    expect(r.body).toEqual({ sesionesCerradas: 1 });
    const yo = await u1.get('/auth/yo');
    expect(yo.status).toBe(401);
    expect(yo.body.error.mensaje).toContain('cerrada');
    const lista = (await admin.get('/usuarios')).body as { id: number; enLinea: boolean }[];
    expect(lista.find((u) => u.id === f.u1)!.enLinea).toBe(false);
  });
});

describe('baja', () => {
  it('baja lógica: no entra, se cierran sus sesiones, conserva sus tickets y el nombre no se reutiliza', async () => {
    const u1 = await entrar('usuario_uno');
    await u1.form('/tickets', { tipoId: f.tipoCA, departamentoId: f.deptoSIS, empresaId: f.empresaAS, moduloId: f.moduloCompras, concepto: 'x', foliosRef: '1', descripcionHtml: '<p>x</p>' }).expect(201);

    expect((await admin.del(`/usuarios/${f.u1}`)).status).toBe(204);
    expect((await u1.get('/auth/yo')).status).toBe(401);
    expect((await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD })).status).toBe(401);
    expect(((await admin.get('/usuarios')).body as { id: number }[]).some((u) => u.id === f.u1)).toBe(false);

    const tickets = await admin.get('/tickets');
    expect(tickets.body.total).toBe(1);
    expect(tickets.body.datos[0].solicitante.username).toBe('usuario_uno');

    expect((await admin.post('/usuarios', nuevo({ username: 'usuario_uno' }))).status).toBe(409);
  });

  it('no se puede eliminar a uno mismo', async () => {
    expect((await admin.del(`/usuarios/${f.admin}`)).status).toBe(409);
  });
});

describe('contactos y técnicos (cualquier usuario con sesión)', () => {
  it('busca contactos activos para "Enviar copia a", sin incluirse a sí mismo', async () => {
    const u1 = await entrar('usuario_uno');
    const r = await u1.get('/usuarios/contactos?q=usuario');
    expect(r.body.map((c: { username: string }) => c.username)).toEqual(['usuario_dos']);
    expect((await u1.get('/usuarios/contactos?q=u')).body).toEqual([]);
  });

  it('los comodines de LIKE no sirven para listar a todos', async () => {
    const u1 = await entrar('usuario_uno');
    expect((await u1.get('/usuarios/contactos?q=%25%25')).body).toEqual([]);
  });

  it('técnicos: solo roles que atienden tickets', async () => {
    const r = await admin.get('/usuarios/tecnicos');
    expect(r.body.map((t: { username: string }) => t.username).sort()).toEqual(['admin_prueba', 'tecnico_prueba']);
  });
});
