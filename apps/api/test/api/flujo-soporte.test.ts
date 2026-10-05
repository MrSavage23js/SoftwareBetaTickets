import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { entrar, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let u1: Cliente;
let admin: Cliente;
let tecnico: Cliente;
let id: number;
beforeEach(async () => {
  f = await reiniciarBD();
  [u1, admin, tecnico] = await Promise.all([entrar('usuario_uno'), entrar('admin_prueba'), entrar('tecnico_prueba')]);
  id = (await u1.form('/tickets', ticketValido(f))).body.id;
});
afterAll(async () => {
  await db.destroy();
});

const detalle = async (c: Cliente = admin) => (await c.get(`/tickets/${id}`)).body;

describe('tomar', () => {
  it('asigna al técnico y pasa a En proceso', async () => {
    expect((await admin.post(`/tickets/${id}/tomar`)).status).toBe(204);
    const d = await detalle();
    expect(d).toMatchObject({ estatus: 'EN_PROCESO', asignado: { id: f.admin } });
    expect(d.tomadoAt).not.toBeNull();
    expect(d.acciones).toEqual(['pausar', 'reasignar', 'responder', 'cerrar', 'noProcede']);
  });

  it('dos técnicos al mismo tiempo: uno lo toma y el otro recibe 409', async () => {
    const [a, b] = await Promise.all([admin.post(`/tickets/${id}/tomar`), tecnico.post(`/tickets/${id}/tomar`)]);
    expect([a.status, b.status].sort()).toEqual([204, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect(perdedor.body.error.mensaje).toMatch(/Otro técnico ya tomó|Solo se pueden tomar tickets pendientes/);
    const eventos = await db.selectFrom('ticket_eventos').select('tipo').where('ticket_id', '=', id).where('tipo', '=', 'TOMADO').execute();
    expect(eventos).toHaveLength(1);
  });

  it('el solicitante no puede tomar → 403', async () => {
    expect((await u1.post(`/tickets/${id}/tomar`)).status).toBe(403);
  });

  it('pendiente: no se puede responder ni cerrar', async () => {
    expect((await admin.form(`/tickets/${id}/respuestas`, { html: '<p>x</p>' })).status).toBe(409);
    expect((await admin.form(`/tickets/${id}/cerrar`, { resolucionHtml: '<p>x</p>', version: 0 })).status).toBe(409);
  });
});

describe('flujo completo', () => {
  it('tomar → responder → comentar → pausar → reanudar → reasignar → cerrar, con historial y correo de cierre', async () => {
    await admin.post(`/tickets/${id}/tomar`).expect(204);
    await admin.form(`/tickets/${id}/respuestas`, { html: '<p>Revisando <strong>ya</strong></p>' }).expect(204);
    expect((await detalle()).primeraRespuestaAt).not.toBeNull();
    await u1.form(`/tickets/${id}/comentarios`, { html: '<p>Gracias</p>' }).expect(204);

    let v = (await detalle()).version;
    expect((await admin.post(`/tickets/${id}/pausar`, { version: v })).status).toBe(400); // sin motivo
    await admin.post(`/tickets/${id}/pausar`, { motivo: 'Esperando datos', version: v }).expect(204);
    expect((await detalle()).estatus).toBe('PAUSADO');
    await admin.post(`/tickets/${id}/reanudar`, { version: (await detalle()).version }).expect(204);

    v = (await detalle()).version;
    expect((await admin.post(`/tickets/${id}/reasignar`, { asignadoAId: f.u2, version: v })).status).toBe(400); // no es técnico
    await admin.post(`/tickets/${id}/reasignar`, { asignadoAId: f.tecnico, version: v }).expect(204);
    // El técnico anterior ya no puede responder ni cerrar.
    expect((await admin.form(`/tickets/${id}/respuestas`, { html: '<p>x</p>' })).status).toBe(409);

    v = (await detalle()).version;
    const sinResolucion = await tecnico.form(`/tickets/${id}/cerrar`, { resolucionHtml: '<p> </p>', version: v });
    expect(sinResolucion.status).toBe(400);
    expect(sinResolucion.body.error.campos).toHaveProperty('resolucionHtml');
    await tecnico.form(`/tickets/${id}/cerrar`, { resolucionHtml: '<p>Carta porte cancelada.</p>', version: v }).expect(204);

    const d = await detalle(u1);
    expect(d).toMatchObject({ estatus: 'COMPLETADO', cerradoPor: { id: f.tecnico }, acciones: [] });
    expect(d.mensajes.map((m: { tipo: string }) => m.tipo)).toEqual(['RESPUESTA', 'COMENTARIO', 'RESOLUCION']);

    const h = (await admin.get(`/tickets/${id}/historial`)).body as { tipo: string; datos: Record<string, unknown> | null; actor: { username: string } | null }[];
    expect(h.map((e) => e.tipo)).toEqual(['CREADO', 'TOMADO', 'RESPONDIDO', 'COMENTADO', 'PAUSADO', 'REANUDADO', 'REASIGNADO', 'CERRADO']);
    expect(h.find((e) => e.tipo === 'PAUSADO')!.datos).toMatchObject({ motivo: 'Esperando datos' });
    expect(h.find((e) => e.tipo === 'REASIGNADO')!.datos).toMatchObject({ deNombre: 'admin_prueba', aNombre: 'tecnico_prueba' });
    expect(h.find((e) => e.tipo === 'CERRADO')!.actor!.username).toBe('tecnico_prueba');

    const correo = await db.selectFrom('correos_salida').selectAll().where('plantilla_codigo', '=', 'TICKET_CERRADO').executeTakeFirstOrThrow();
    expect(correo.para[0]!.email).toBe('usuario_uno@prueba.local');
    expect(correo.cuerpo_html).toContain('tecnico_prueba');
    expect(correo.cuerpo_html).toContain('Carta porte cancelada.');

    // Completado: ya no admite comentarios.
    const tarde = await u1.form(`/tickets/${id}/comentarios`, { html: '<p>otra cosa</p>' });
    expect(tarde.status).toBe(409);
  });

  it('las respuestas no envían correo por defecto; con el ajuste encendido sí', async () => {
    await admin.post(`/tickets/${id}/tomar`).expect(204);
    await admin.form(`/tickets/${id}/respuestas`, { html: '<p>uno</p>' }).expect(204);
    const cuenta = async () => (await db.selectFrom('correos_salida').select('id').where('plantilla_codigo', '=', 'TICKET_RESPUESTA').execute()).length;
    expect(await cuenta()).toBe(0);
    await admin.put('/ajustes', { 'correo.respuestas_activas': true }).expect(200);
    await admin.form(`/tickets/${id}/respuestas`, { html: '<p>dos</p>' }).expect(204);
    expect(await cuenta()).toBe(1);
  });

  it('aviso a soporte al crear (ajuste apagado por defecto)', async () => {
    await admin.put('/ajustes', { 'correo.aviso_soporte_activo': true, 'correo.aviso_soporte_destino': 'soporte@prueba.local' }).expect(200);
    const r = await u1.form('/tickets', ticketValido(f));
    expect(r.body.correosEncolados).toBe(2);
  });

  it('el aviso de ticket nuevo llega a todos los admins activos aunque no haya correos extra', async () => {
    await admin.put('/ajustes', { 'correo.aviso_soporte_activo': true, 'correo.aviso_soporte_destino': 'Admin_Prueba@prueba.local' }).expect(200);
    // Un admin desactivado y un usuario normal no lo reciben; el correo extra repetido no se duplica.
    await db.updateTable('usuarios').set({ activo: 0 }).where('id', '=', f.tecnico).execute();
    const { id: nuevo } = (await u1.form('/tickets', ticketValido(f))).body;
    const aviso = await db.selectFrom('correos_salida').select('para').where('plantilla_codigo', '=', 'TICKET_NUEVO_SOPORTE').where('ticket_id', '=', nuevo).executeTakeFirstOrThrow();
    const para = (typeof aviso.para === 'string' ? JSON.parse(aviso.para) : aviso.para) as { email: string }[];
    expect(para.map((d) => d.email)).toEqual(['admin_prueba@prueba.local']);
  });

  it('el aviso a soporte admite varios correos separados por coma', async () => {
    const r = await admin.put('/ajustes', { 'correo.aviso_soporte_activo': true, 'correo.aviso_soporte_destino': ' Uno@prueba.local ; dos@prueba.local,' });
    expect(r.status).toBe(200);
    const { id: nuevo, folio } = (await u1.form('/tickets', { ...ticketValido(f), copias: [{ email: 'externo@prueba.local' }] })).body;
    const aviso = await db
      .selectFrom('correos_salida')
      .select(['para', 'asunto', 'cuerpo_html'])
      .where('plantilla_codigo', '=', 'TICKET_NUEVO_SOPORTE')
      .where('ticket_id', '=', nuevo)
      .executeTakeFirstOrThrow();
    const para = (typeof aviso.para === 'string' ? JSON.parse(aviso.para) : aviso.para) as { email: string }[];
    expect(para.map((d) => d.email)).toEqual(['admin_prueba@prueba.local', 'tecnico_prueba@prueba.local', 'uno@prueba.local', 'dos@prueba.local']);
    // Asunto con folio y urgencia; el cuerpo dice quién lo reportó (con su correo) y a quién se envió copia.
    expect(aviso.asunto).toMatch(new RegExp(`^Nuevo ticket: ${folio} — Urgencia \\S+`));
    expect(aviso.cuerpo_html).toContain('usuario_uno@prueba.local');
    expect(aviso.cuerpo_html).toContain('En copia: externo@prueba.local');
  });

  it('aviso a soporte al cerrar: va a los admins y a los mismos correos extra, y se puede apagar', async () => {
    const avisos = async (ticket: number) =>
      db.selectFrom('correos_salida').select(['para', 'asunto', 'cuerpo_html']).where('plantilla_codigo', '=', 'TICKET_CERRADO_SOPORTE').where('ticket_id', '=', ticket).execute();
    const correos = (a: { para: unknown }) => ((typeof a.para === 'string' ? JSON.parse(a.para) : a.para) as { email: string }[]).map((d) => d.email);
    // Sin correos extra (valor inicial) igual llega a todos los admins, incluido quien lo cerró.
    await admin.post(`/tickets/${id}/tomar`).expect(204);
    await admin.form(`/tickets/${id}/cerrar`, { resolucionHtml: '<p>Listo.</p>', version: (await detalle()).version }).expect(204);
    expect((await avisos(id)).map(correos)).toEqual([['admin_prueba@prueba.local', 'tecnico_prueba@prueba.local']]);

    await admin.put('/ajustes', { 'correo.aviso_soporte_destino': 'uno@prueba.local, dos@prueba.local' }).expect(200);
    const { id: otro, folio } = (await u1.form('/tickets', ticketValido(f))).body;
    await admin.post(`/tickets/${otro}/tomar`).expect(204);
    await admin.form(`/tickets/${otro}/cerrar`, { resolucionHtml: '<p>Se reinició el servicio.</p>', version: (await admin.get(`/tickets/${otro}`)).body.version }).expect(204);
    const [aviso] = await avisos(otro);
    expect(correos(aviso!)).toEqual(['admin_prueba@prueba.local', 'tecnico_prueba@prueba.local', 'uno@prueba.local', 'dos@prueba.local']);
    expect(aviso!.asunto).toContain(folio);
    expect(aviso!.cuerpo_html).toContain('Se reinició el servicio.');
    expect(aviso!.cuerpo_html).toContain('usuario_uno@prueba.local');

    // "No procede" también avisa; con el ajuste apagado, ya no.
    const { id: tercero } = (await u1.form('/tickets', ticketValido(f))).body;
    await admin.post(`/tickets/${tercero}/no-procede`, { motivo: 'Duplicado', version: (await admin.get(`/tickets/${tercero}`)).body.version }).expect(204);
    expect((await avisos(tercero))[0]!.cuerpo_html).toContain('Duplicado');

    await admin.put('/ajustes', { 'correo.aviso_cierre_activo': false }).expect(200);
    const { id: cuarto } = (await u1.form('/tickets', ticketValido(f))).body;
    await admin.post(`/tickets/${cuarto}/no-procede`, { motivo: 'Otro', version: (await admin.get(`/tickets/${cuarto}`)).body.version }).expect(204);
    expect(await avisos(cuarto)).toHaveLength(0);
  });
});

describe('no procede', () => {
  it('un admin lo marca desde pendiente con motivo: queda cerrado, el solicitante ve el motivo y recibe correo', async () => {
    const v = (await detalle()).version;
    expect((await u1.post(`/tickets/${id}/no-procede`, { motivo: 'x', version: v })).status).toBe(403);
    expect((await admin.post(`/tickets/${id}/no-procede`, { version: v })).status).toBe(400); // sin motivo
    await admin.post(`/tickets/${id}/no-procede`, { motivo: 'No es <de> sistemas', version: v }).expect(204);

    const d = await detalle(u1);
    expect(d).toMatchObject({ estatus: 'NO_PROCEDE', cerradoPor: { id: f.admin }, acciones: [] });
    expect(d.mensajes).toHaveLength(1);
    expect(d.mensajes[0]).toMatchObject({ tipo: 'RESOLUCION' });
    expect(d.mensajes[0].html).toContain('No es &lt;de&gt; sistemas');

    const h = (await admin.get(`/tickets/${id}/historial`)).body as { tipo: string; datos: Record<string, unknown> | null }[];
    expect(h.at(-1)).toMatchObject({ tipo: 'NO_PROCEDE', datos: { motivo: 'No es <de> sistemas' } });
    const correo = await db.selectFrom('correos_salida').selectAll().where('plantilla_codigo', '=', 'TICKET_CERRADO').executeTakeFirstOrThrow();
    expect(correo.cuerpo_html).toContain('No procede');

    // Es final: ni se vuelve a marcar ni admite comentarios.
    expect((await admin.post(`/tickets/${id}/no-procede`, { motivo: 'otra', version: d.version })).status).toBe(409);
    expect((await u1.form(`/tickets/${id}/comentarios`, { html: '<p>¿por qué?</p>' })).status).toBe(409);
  });
});

describe('cambios simultáneos (versión)', () => {
  it('una acción con versión vieja se rechaza con 409 VERSION', async () => {
    await admin.post(`/tickets/${id}/tomar`).expect(204);
    const vieja = (await detalle()).version;
    await admin.post(`/tickets/${id}/pausar`, { motivo: 'uno', version: vieja }).expect(204);
    const r = await admin.post(`/tickets/${id}/reanudar`, { version: vieja });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('VERSION');
  });
});

describe('comentarios del solicitante', () => {
  it('puede comentar su ticket; vacío → 400; solo archivo sin texto es válido', async () => {
    await u1.form(`/tickets/${id}/comentarios`, { html: '<p>Más datos</p>' }).expect(204);
    expect((await u1.form(`/tickets/${id}/comentarios`, { html: '<p></p>' })).status).toBe(400);
    await u1.form(`/tickets/${id}/comentarios`, { html: '' }, [{ nombre: 'nota.txt', contenido: 'detalle' }]).expect(204);
  });

  it('el admin no comenta como solicitante (usa responder)', async () => {
    expect((await admin.form(`/tickets/${id}/comentarios`, { html: '<p>x</p>' })).status).toBe(403);
  });
});
