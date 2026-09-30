import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { entrar, folio, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let u1: Cliente;
let admin: Cliente;
beforeEach(async () => {
  f = await reiniciarBD();
  [u1, admin] = await Promise.all([entrar('usuario_uno'), entrar('admin_prueba')]);
});
afterAll(async () => {
  await db.destroy();
});

const crear = async (extra: Record<string, unknown> = {}) => (await u1.form('/tickets', ticketValido(f, extra))).body as { id: number; folio: string };

describe('urgencia', () => {
  it('si no se elige, queda en "media"; se puede elegir otra', async () => {
    const a = await crear();
    const b = await crear({ urgencia: 'CRITICA' });
    expect((await u1.get(`/tickets/${a.id}`)).body.urgencia).toBe('MEDIA');
    expect((await u1.get(`/tickets/${b.id}`)).body.urgencia).toBe('CRITICA');
  });

  it('valor inválido → 400', async () => {
    const r = await u1.form('/tickets', ticketValido(f, { urgencia: 'URGENTISIMA' }));
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty('urgencia');
  });

  it('ordenar por urgencia pone la crítica arriba; a igual urgencia, los más recientes primero', async () => {
    for (const urgencia of ['BAJA', 'CRITICA', 'MEDIA', 'ALTA', 'CRITICA']) await crear({ urgencia });
    const r = await admin.get('/tickets?orden=urgencia');
    expect(r.body.datos.map((t: { urgencia: string }) => t.urgencia)).toEqual(['CRITICA', 'CRITICA', 'ALTA', 'MEDIA', 'BAJA']);
    const criticas = r.body.datos.slice(0, 2).map((t: { folio: string }) => t.folio);
    expect(criticas).toEqual([folio('SIS', 5), folio('SIS', 2)]);
  });

  it('filtro por urgencia', async () => {
    await crear({ urgencia: 'ALTA' });
    await crear({ urgencia: 'BAJA' });
    const r = await admin.get('/tickets?urgencia=ALTA');
    expect(r.body.total).toBe(1);
    expect((await admin.get('/tickets?urgencia=NADA')).status).toBe(400);
  });
});

describe('dashboard de administración', () => {
  it('un usuario que no es admin recibe 403 aunque conozca la ruta', async () => {
    const r = await u1.get('/panel/resumen');
    expect(r.status).toBe(403);
  });

  it('resumen: abiertos, en proceso, cerrados hoy/semana, crítica/alta sin atender y gráficas', async () => {
    const critica = await crear({ urgencia: 'CRITICA' });
    await crear({ urgencia: 'ALTA' });
    const alta2 = await crear({ urgencia: 'ALTA' });
    const cerrar = await crear({ urgencia: 'BAJA', departamentoId: f.deptoRH });

    // Uno alta en proceso (ya atendido) y uno cerrado hoy.
    await admin.post(`/tickets/${alta2.id}/tomar`).expect(204);
    await admin.post(`/tickets/${cerrar.id}/tomar`).expect(204);
    const v = (await admin.get(`/tickets/${cerrar.id}`)).body.version;
    await admin.form(`/tickets/${cerrar.id}/cerrar`, { resolucionHtml: '<p>listo</p>', version: v }).expect(204);

    const r = await admin.get('/panel/resumen');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      abiertos: 3,
      pendientes: 2,
      enProceso: 1,
      pausados: 0,
      cerradosHoy: 1,
      cerradosSemana: 1,
      criticosSinAtender: 1,
      altosSinAtender: 1,
    });
    expect(r.body.abiertosPorUrgencia).toEqual([
      { urgencia: 'CRITICA', total: 1 },
      { urgencia: 'ALTA', total: 2 },
      { urgencia: 'MEDIA', total: 0 },
      { urgencia: 'BAJA', total: 0 },
    ]);
    const deptos = Object.fromEntries(r.body.abiertosPorDepartamento.map((d: { codigo: string; total: number }) => [d.codigo, d.total]));
    expect(deptos).toEqual({ SIS: 3, RH: 0 });
    void critica;
  });

  it('un ticket cerrado la semana pasada no cuenta como cerrado esta semana', async () => {
    const t = await crear();
    await admin.post(`/tickets/${t.id}/tomar`).expect(204);
    const v = (await admin.get(`/tickets/${t.id}`)).body.version;
    await admin.form(`/tickets/${t.id}/cerrar`, { resolucionHtml: '<p>ok</p>', version: v }).expect(204);
    await db.updateTable('tickets').set({ cerrado_at: new Date(Date.now() - 9 * 86_400_000) }).where('id', '=', t.id).execute();
    const r = await admin.get('/panel/resumen');
    expect(r.body).toMatchObject({ cerradosHoy: 0, cerradosSemana: 0, abiertos: 0 });
  });
});

describe('notificaciones', () => {
  const lista = async (c: Cliente, q = '') => (await c.get(`/notificaciones${q}`)).body as { noLeidas: number; datos: { id: number; tipo: string; mensaje: string; leida: boolean; ticket: { id: number; folio: string } }[] };

  it('ticket nuevo → notifica a cada admin (no a quien lo creó)', async () => {
    const t = await crear({ urgencia: 'CRITICA' });
    const tecnico = await entrar('tecnico_prueba');
    for (const c of [admin, tecnico]) {
      const l = await lista(c);
      expect(l.noLeidas).toBe(1);
      expect(l.datos[0]).toMatchObject({ tipo: 'nuevo_ticket', leida: false, ticket: { id: t.id, folio: t.folio } });
      expect(l.datos[0]!.mensaje).toContain(t.folio);
      expect(l.datos[0]!.mensaje).toMatch(/CRÍTICA/);
    }
    expect((await lista(u1)).noLeidas).toBe(0);
  });

  it('respuestas y cambios de soporte → notifican al solicitante; sus propios comentarios no', async () => {
    const t = await crear();
    await u1.form(`/tickets/${t.id}/comentarios`, { html: '<p>más datos</p>' }).expect(204);
    expect((await lista(u1)).noLeidas).toBe(0);

    await admin.post(`/tickets/${t.id}/tomar`).expect(204);
    await admin.form(`/tickets/${t.id}/respuestas`, { html: '<p>revisando</p>' }).expect(204);
    const v = (await admin.get(`/tickets/${t.id}`)).body.version;
    await admin.form(`/tickets/${t.id}/cerrar`, { resolucionHtml: '<p>listo</p>', version: v }).expect(204);

    const l = await lista(u1);
    expect(l.noLeidas).toBe(3);
    expect(l.datos.every((n) => n.tipo === 'ticket_contestado' && n.ticket.id === t.id)).toBe(true);
    expect(l.datos.map((n) => n.mensaje)).toEqual([
      `Tu ticket ${t.folio} fue cerrado`,
      `Soporte respondió tu ticket ${t.folio}`,
      `admin_prueba tomó tu ticket ${t.folio}`,
    ]);
  });

  it('marcar como leída una, luego todas; solo las propias', async () => {
    await crear();
    await crear();
    const l = await lista(admin);
    expect(l.noLeidas).toBe(2);

    await admin.post(`/notificaciones/${l.datos[0]!.id}/leida`).expect(204);
    expect((await lista(admin)).noLeidas).toBe(1);
    expect((await lista(admin, '?no_leidas=1')).datos).toHaveLength(1);
    // Marcarla otra vez no falla.
    await admin.post(`/notificaciones/${l.datos[0]!.id}/leida`).expect(204);

    // Una notificación ajena responde 404 y no se marca.
    const tecnico = await entrar('tecnico_prueba');
    const ajena = (await lista(tecnico)).datos[0]!;
    expect((await admin.post(`/notificaciones/${ajena.id}/leida`)).status).toBe(404);
    expect((await lista(tecnico)).noLeidas).toBe(2);

    expect((await admin.post('/notificaciones/leer-todas')).body).toEqual({ marcadas: 1 });
    expect((await lista(admin)).noLeidas).toBe(0);
  });

  it('admin que reporta su ticket: no se avisa a sí mismo al crearlo; recibe "ticket_contestado" cuando otro admin responde', async () => {
    const tecnico = await entrar('tecnico_prueba');
    const t = (await tecnico.form('/tickets', ticketValido(f)).expect(201)).body as { id: number };
    // Solo el otro admin recibe el "nuevo_ticket"; los usuarios normales no reciben nada.
    expect((await lista(tecnico)).noLeidas).toBe(0);
    expect((await lista(admin)).datos.map((n) => n.tipo)).toEqual(['nuevo_ticket']);
    expect((await lista(u1)).noLeidas).toBe(0);

    await admin.post(`/tickets/${t.id}/tomar`).expect(204);
    await admin.form(`/tickets/${t.id}/respuestas`, { html: '<p>va</p>' }).expect(204);
    const l = await lista(tecnico);
    expect(l.noLeidas).toBe(2);
    expect(l.datos.every((n) => n.tipo === 'ticket_contestado')).toBe(true);
    // Y como admin sigue viendo los "nuevo_ticket" de otros.
    await crear();
    expect((await lista(tecnico)).datos.map((n) => n.tipo)).toEqual(['nuevo_ticket', 'ticket_contestado', 'ticket_contestado']);
  });

  it('un admin que responde su propio ticket no se notifica a sí mismo', async () => {
    const t = (await admin.form('/tickets', ticketValido(f)).expect(201)).body as { id: number };
    await admin.post(`/tickets/${t.id}/tomar`).expect(204);
    await admin.form(`/tickets/${t.id}/respuestas`, { html: '<p>yo mismo</p>' }).expect(204);
    expect((await lista(admin)).noLeidas).toBe(0);
  });

  it('la campana aplica las reglas por rol: quien deja de ser admin deja de ver los "nuevo_ticket"', async () => {
    await crear();
    const rolUsuario = await db.selectFrom('roles').select('id').where('codigo', '=', 'USUARIO').executeTakeFirstOrThrow();
    await db.updateTable('usuarios').set({ rol_id: rolUsuario.id }).where('id', '=', f.tecnico).execute();
    const tecnico = await entrar('tecnico_prueba');
    expect(await lista(tecnico)).toEqual({ noLeidas: 0, datos: [] });
    // "Marcar todas" tampoco toca las que no ve.
    expect((await tecnico.post('/notificaciones/leer-todas')).body).toEqual({ marcadas: 0 });
  });

  it('un usuario dado de baja no recibe notificaciones', async () => {
    const t = await crear();
    await admin.del(`/usuarios/${f.u1}`).expect(204);
    await admin.post(`/tickets/${t.id}/tomar`).expect(204);
    const n = await db.selectFrom('notificaciones').select('id').where('usuario_id', '=', f.u1).execute();
    expect(n).toHaveLength(0);
  });
});
