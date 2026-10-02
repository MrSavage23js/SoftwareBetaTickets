import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../../src/db/conexion';
import { anonimo, entrar, PASSWORD, reiniciarBD, type Fixtures } from '../ayudas';

let f: Fixtures;
beforeEach(async () => {
  f = await reiniciarBD();
});
afterAll(async () => {
  await db.destroy();
});

describe('GET /health', () => {
  it('responde 200 con la BD disponible', async () => {
    const r = await anonimo().get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'ok', bd: 'ok' });
  });
});

describe('inicio de sesión', () => {
  it('credenciales correctas: cookie httpOnly SameSite=Strict, datos de sesión y último acceso', async () => {
    const r = await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.usuario).toMatchObject({ username: 'usuario_uno', rol: { codigo: 'USUARIO' }, debeCambiarPassword: false });
    expect(r.body.usuario.empresas).toEqual([{ id: f.empresaAS, nombre: 'Autotransportes Asturcones' }]);
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const u = await db.selectFrom('usuarios').select('ultimo_login_at').where('id', '=', f.u1).executeTakeFirstOrThrow();
    expect(u.ultimo_login_at).not.toBeNull();
  });

  it('en BD solo se guarda el hash del token, nunca el token', async () => {
    const r = await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD });
    const token = /mesa_sid=([^;]+)/.exec(String(r.headers['set-cookie']))![1]!;
    const filas = await db.selectFrom('sesiones').select('id').execute();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.id).not.toBe(token);
    expect(filas[0]!.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('contraseña incorrecta y usuario inexistente dan el mismo mensaje', async () => {
    const a = await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: 'Incorrecta1' });
    const b = await anonimo().post('/api/auth/login').send({ username: 'no_existe', password: 'Incorrecta1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.mensaje).toContain('Usuario o contraseña incorrectos.');
    expect(b.body.error.mensaje).toBe('Usuario o contraseña incorrectos.');
  });

  it('datos vacíos → 400 con el error de cada campo', async () => {
    const r = await anonimo().post('/api/auth/login').send({});
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty('username');
    expect(r.body.error.campos).toHaveProperty('password');
  });

  it('JSON mal formado → 400, no 500', async () => {
    const r = await anonimo().post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('JSON_INVALIDO');
  });

  it('bloqueo temporal tras 5 intentos fallidos, aunque después la contraseña sea correcta', async () => {
    for (let i = 1; i <= 4; i++) {
      expect((await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: `Mala${i}xx` })).status).toBe(401);
    }
    const quinto = await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: 'Mala5xx' });
    expect(quinto.status).toBe(423);
    expect(quinto.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    const correcta = await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD });
    expect(correcta.status).toBe(423);
    // Vencido el bloqueo, entra normalmente.
    await db.updateTable('usuarios').set({ bloqueado_hasta: new Date(Date.now() - 1000) }).where('id', '=', f.u1).execute();
    expect((await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD })).status).toBe(200);
  });

  it('usuario desactivado o dado de baja no entra', async () => {
    await db.updateTable('usuarios').set({ activo: 0 }).where('id', '=', f.u1).execute();
    expect((await anonimo().post('/api/auth/login').send({ username: 'usuario_uno', password: PASSWORD })).status).toBe(403);
    await db.updateTable('usuarios').set({ eliminado_at: new Date() }).where('id', '=', f.u2).execute();
    expect((await anonimo().post('/api/auth/login').send({ username: 'usuario_dos', password: PASSWORD })).status).toBe(401);
  });
});

describe('sesión', () => {
  it('/auth/yo sin sesión → 401', async () => {
    expect((await anonimo().get('/api/auth/yo')).status).toBe(401);
  });

  it('cerrar sesión invalida la cookie en el servidor', async () => {
    const c = await entrar('usuario_uno');
    expect((await c.get('/auth/yo')).status).toBe(200);
    expect((await c.post('/auth/logout')).status).toBe(204);
    expect((await c.get('/auth/yo')).status).toBe(401);
  });

  it('se cierra por inactividad y avisa el motivo', async () => {
    const c = await entrar('usuario_uno');
    await db.updateTable('sesiones').set({ ultima_actividad_at: sql<Date>`now() - interval '31 minutes'` }).execute();
    const r = await c.get('/auth/yo');
    expect(r.status).toBe(401);
    expect(r.body.error.mensaje).toContain('inactividad');
    const s = await db.selectFrom('sesiones').select('motivo_cierre').executeTakeFirstOrThrow();
    expect(s.motivo_cierre).toBe('INACTIVIDAD');
  });

  it('respeta la duración máxima aunque haya actividad', async () => {
    const c = await entrar('usuario_uno');
    await db.updateTable('sesiones').set({ expira_absoluta_at: sql<Date>`now() - interval '1 second'` }).execute();
    expect((await c.get('/auth/yo')).status).toBe(401);
  });

  it('las consultas automáticas no cuentan como actividad; /auth/actividad sí', async () => {
    const c = await entrar('usuario_uno');
    const hace10 = new Date(Date.now() - 10 * 60_000);
    await db.updateTable('sesiones').set({ ultima_actividad_at: hace10 }).execute();
    await c.get('/auth/yo').set('X-Sin-Actividad', '1');
    await new Promise((r) => setTimeout(r, 100));
    const s1 = await db.selectFrom('sesiones').select('ultima_actividad_at').executeTakeFirstOrThrow();
    expect(s1.ultima_actividad_at.getTime()).toBe(hace10.getTime());
    expect((await c.post('/auth/actividad')).status).toBe(204);
    const s2 = await db.selectFrom('sesiones').select('ultima_actividad_at').executeTakeFirstOrThrow();
    expect(s2.ultima_actividad_at.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('una cookie inventada no da acceso', async () => {
    const r = await anonimo().get('/api/auth/yo').set('Cookie', 'mesa_sid=' + 'x'.repeat(43));
    expect(r.status).toBe(401);
  });
});

describe('protección CSRF', () => {
  it('POST con sesión sin token CSRF → 403', async () => {
    const c = await entrar('usuario_uno');
    const r = await c.agente.post('/api/auth/actividad');
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('CSRF');
  });

  it('POST con token de otra sesión → 403', async () => {
    const a = await entrar('usuario_uno');
    const b = await entrar('usuario_dos');
    expect((await a.agente.post('/api/auth/actividad').set('X-CSRF-Token', b.csrf)).status).toBe(403);
  });

  it('POST desde otro sitio (Origin ajeno) → 403 aunque traiga token', async () => {
    const c = await entrar('usuario_uno');
    const r = await c.agente.post('/api/auth/actividad').set('X-CSRF-Token', c.csrf).set('Origin', 'https://sitio-malo.com');
    expect(r.status).toBe(403);
  });

  it('login desde otro sitio → 403', async () => {
    const r = await anonimo().post('/api/auth/login').set('Origin', 'https://sitio-malo.com').send({ username: 'usuario_uno', password: PASSWORD });
    expect(r.status).toBe(403);
  });
});

describe('cambio de contraseña', () => {
  it('un usuario creado por el admin debe cambiar su contraseña antes de usar el sistema', async () => {
    const admin = await entrar('admin_prueba');
    const roles = (await admin.get('/usuarios/roles')).body as { id: number; codigo: string }[];
    await admin
      .post('/usuarios', {
        username: 'nuevo_empleado',
        email: 'nuevo@prueba.local',
        password: 'Temporal123',
        confirmarPassword: 'Temporal123',
        rolId: roles.find((r) => r.codigo === 'USUARIO')!.id,
        empresaIds: [f.empresaAS],
      })
      .expect(201);

    const c = await entrar('nuevo_empleado', 'Temporal123');
    expect((await c.get('/auth/yo')).body.usuario.debeCambiarPassword).toBe(true);
    const bloqueado = await c.get('/tickets');
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.error.codigo).toBe('CAMBIAR_PASSWORD');

    const malo = await c.post('/auth/cambiar-password', { actual: 'Incorrecta1', nueva: 'MiClave2026', confirmar: 'MiClave2026' });
    expect(malo.status).toBe(400);
    expect(malo.body.error.campos).toHaveProperty('actual');

    const debil = await c.post('/auth/cambiar-password', { actual: 'Temporal123', nueva: 'corta', confirmar: 'corta' });
    expect(debil.status).toBe(400);

    const ok = await c.post('/auth/cambiar-password', { actual: 'Temporal123', nueva: 'MiClave2026', confirmar: 'MiClave2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.usuario.debeCambiarPassword).toBe(false);
    expect((await c.get('/tickets')).status).toBe(200);
    await entrar('nuevo_empleado', 'MiClave2026');
  });

  it('cambiar la contraseña cierra las otras sesiones y mantiene la actual', async () => {
    const pc = await entrar('usuario_uno');
    const celular = await entrar('usuario_uno');
    expect((await pc.post('/auth/cambiar-password', { actual: PASSWORD, nueva: 'OtraClave99', confirmar: 'OtraClave99' })).status).toBe(200);
    expect((await pc.get('/auth/yo')).status).toBe(200);
    expect((await celular.get('/auth/yo')).status).toBe(401);
  });
});
