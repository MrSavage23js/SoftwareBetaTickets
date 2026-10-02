import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { RUTAS } from '../../src/config/env';
import { db } from '../../src/db/conexion';
import { procesarCola } from '../../src/modulos/correos/trabajador';
import { usarTransporte, type Transporte } from '../../src/modulos/correos/transportes';
import { entrar, folio, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let u1: Cliente;
let admin: Cliente;
beforeEach(async () => {
  f = await reiniciarBD();
  [u1, admin] = await Promise.all([entrar('usuario_uno'), entrar('admin_prueba')]);
});
afterAll(async () => {
  usarTransporte(undefined);
  await db.destroy();
});

const falla: Transporte = {
  nombre: 'smtp',
  enviar: async () => {
    throw new Error('ECONNREFUSED smtp.office365.com:587');
  },
};

const correo = () => db.selectFrom('correos_salida').selectAll().orderBy('id').executeTakeFirstOrThrow();

describe('cola de salida', () => {
  it('modo consola: el correo se guarda como .eml y queda ENVIADO', async () => {
    await u1.form('/tickets', ticketValido(f)).expect(201);
    expect(await procesarCola()).toBe(1);
    expect(await correo()).toMatchObject({ estado: 'ENVIADO', intentos: 1, transporte: 'consola' });
    const emls = readdirSync(RUTAS.correosConsola).filter((n) => n.endsWith('.eml'));
    expect(emls).toHaveLength(1);
    const eml = readFileSync(join(RUTAS.correosConsola, emls[0]!), 'utf8');
    expect(eml).toMatch(/^To: usuario_uno <usuario_uno@prueba\.local>/m);
    // El folio va en el asunto del correo que llega a Outlook.
    // (el asunto con acentos viaja codificado en el .eml; el folio queda legible)
    expect(eml).toMatch(new RegExp(`Subject: .*${folio('SIS', 1)}`));
    expect((await correo()).asunto).toBe(`[${folio('SIS', 1)}] Ticket creado · Cancelación`);
  });

  it('si el correo falla, el ticket se crea igual y se reintenta con espera progresiva', async () => {
    usarTransporte(falla);
    const r = await u1.form('/tickets', ticketValido(f));
    expect(r.status).toBe(201);

    await procesarCola();
    let c = await correo();
    expect(c).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    expect(c.ultimo_error).toContain('ECONNREFUSED');
    expect(c.proximo_intento_at.getTime()).toBeGreaterThan(Date.now() + 30_000);
    // Antes de su hora no se vuelve a intentar.
    expect(await procesarCola()).toBe(0);

    // Llega su hora y el servidor ya responde.
    usarTransporte(undefined);
    await db.updateTable('correos_salida').set({ proximo_intento_at: new Date(Date.now() - 1000) }).execute();
    await procesarCola();
    c = await correo();
    expect(c).toMatchObject({ estado: 'ENVIADO', intentos: 2, ultimo_error: null });
  });

  it('al agotar los intentos queda FALLIDO, se registra en el historial y se puede reintentar a mano', async () => {
    usarTransporte(falla);
    const r = await u1.form('/tickets', ticketValido(f));
    await db.updateTable('correos_salida').set({ intentos: 6 }).execute();
    await procesarCola();
    expect(await correo()).toMatchObject({ estado: 'FALLIDO', intentos: 7 });
    const h = (await admin.get(`/tickets/${r.body.id}/historial`)).body as { tipo: string }[];
    expect(h.map((e) => e.tipo)).toContain('CORREO_FALLIDO');

    const lista = await admin.get('/correos?estado=FALLIDO');
    expect(lista.body.total).toBe(1);
    expect(lista.body.resumen).toMatchObject({ FALLIDO: 1 });
    await admin.post(`/correos/${lista.body.datos[0].id}/reintentar`).expect(204);
    expect(await correo()).toMatchObject({ estado: 'PENDIENTE', intentos: 0 });
    // Solo fallidos o cancelados se reintentan.
    expect((await admin.post(`/correos/${lista.body.datos[0].id}/reintentar`)).status).toBe(409);
  });

  it('un correo "atorado" en ENVIANDO (el proceso se cayó) se recupera al vencer su bloqueo', async () => {
    await u1.form('/tickets', ticketValido(f));
    await db.updateTable('correos_salida').set({ estado: 'ENVIANDO', bloqueado_hasta: sql<Date>`now() - interval '1 minute'` }).execute();
    await procesarCola();
    expect((await correo()).estado).toBe('ENVIADO');
  });

  it('a un usuario dado de baja no se le envían correos', async () => {
    const r = await u1.form('/tickets', ticketValido(f));
    await admin.del(`/usuarios/${f.u1}`).expect(204);
    await admin.post(`/tickets/${r.body.id}/tomar`).expect(204);
    const v = (await admin.get(`/tickets/${r.body.id}`)).body.version;
    await admin.form(`/tickets/${r.body.id}/cerrar`, { resolucionHtml: '<p>ok</p>', version: v }).expect(204);
    const cierre = await db.selectFrom('correos_salida').select('id').where('plantilla_codigo', '=', 'TICKET_CERRADO').execute();
    expect(cierre).toHaveLength(0);
  });
});

describe('plantillas', () => {
  it('editar: se eliminan scripts, se conservan variables y la vista previa escapa los datos', async () => {
    const lista = (await admin.get('/correos/plantillas')).body as { id: number; codigo: string }[];
    const creado = lista.find((p) => p.codigo === 'TICKET_CREADO')!;
    const r = await admin.put(`/correos/plantillas/${creado.id}`, {
      asunto: 'Nuevo {{folio}}',
      cuerpoHtml: '<p onclick="x()">Hola {{solicitante}}</p><script>alert(1)</script><a href="{{url_ticket}}">Ver</a>',
      activa: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.cuerpoHtml).not.toMatch(/script|onclick/);
    expect(r.body.cuerpoHtml).toContain('href="{{url_ticket}}"');

    await u1.form('/tickets', ticketValido(f, { concepto: '<b>negritas</b>' }));
    const c = await correo();
    expect(c.asunto).toBe(`Nuevo ${folio('SIS', 1)}`);

    const previa = await admin.post('/correos/plantillas/vista-previa', { asunto: '{{folio}}', cuerpoHtml: '<p>{{concepto}}</p>' });
    expect(previa.body).toEqual({ asunto: 'SIS-2026-0063', html: '<p>CARTA PORTE</p>' });
  });

  it('no se puede guardar una plantilla de ticket sin {{folio}} en el asunto', async () => {
    const lista = (await admin.get('/correos/plantillas')).body as { id: number; codigo: string; cuerpoHtml: string }[];
    const cerrado = lista.find((p) => p.codigo === 'TICKET_CERRADO')!;
    const r = await admin.put(`/correos/plantillas/${cerrado.id}`, { asunto: 'Tu ticket fue cerrado', cuerpoHtml: cerrado.cuerpoHtml, activa: true });
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty('asunto');
  });

  it('aunque la plantilla guardada no traiga el folio, el asunto siempre lo incluye', async () => {
    await db.updateTable('plantillas_correo').set({ asunto: 'Ticket creado' }).where('codigo', '=', 'TICKET_CREADO').execute();
    await u1.form('/tickets', ticketValido(f));
    expect((await correo()).asunto).toBe(`[${folio('SIS', 1)}] Ticket creado`);
  });

  it('el concepto escrito por el usuario llega escapado al correo', async () => {
    await u1.form('/tickets', ticketValido(f, { concepto: '<img src=x onerror=alert(1)>' }));
    const c = await correo();
    expect(c.cuerpo_html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(c.cuerpo_html).not.toContain('<img src=x');
  });

  it('una plantilla desactivada no genera correo (y el ticket se crea igual)', async () => {
    const lista = (await admin.get('/correos/plantillas')).body as { id: number; codigo: string; asunto: string; cuerpoHtml: string }[];
    const p = lista.find((x) => x.codigo === 'TICKET_CREADO')!;
    await admin.put(`/correos/plantillas/${p.id}`, { asunto: p.asunto, cuerpoHtml: p.cuerpoHtml, activa: false }).expect(200);
    const r = await u1.form('/tickets', ticketValido(f));
    expect(r.body.correosEncolados).toBe(0);
    expect(existsSync(RUTAS.correosConsola)).toBe(true);
  });
});
