import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { siguienteConsecutivo } from '../../src/modulos/tickets/folio';
import { entrar, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let u1: Cliente;
beforeEach(async () => {
  f = await reiniciarBD();
  u1 = await entrar('usuario_uno');
});
afterAll(async () => {
  await db.destroy();
});

describe('crear ticket', () => {
  it('ticket + folio + historial + correo en cola, todo en una operación', async () => {
    const r = await u1.form('/tickets', { ...ticketValido(f), copias: [{ usuarioId: f.u2 }, { email: 'Externo@Proveedor.com' }] });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: expect.any(Number), folio: 'ASCA-0001', correosEncolados: 1 });

    const t = await db.selectFrom('tickets').selectAll().where('id', '=', r.body.id).executeTakeFirstOrThrow();
    expect(t).toMatchObject({ estatus: 'PENDIENTE', solicitante_id: f.u1, creado_por_id: f.u1, asignado_a_id: null });
    const eventos = await db.selectFrom('ticket_eventos').select('tipo').where('ticket_id', '=', t.id).execute();
    expect(eventos.map((e) => e.tipo)).toEqual(['CREADO']);
    const correo = await db.selectFrom('correos_salida').selectAll().where('ticket_id', '=', t.id).executeTakeFirstOrThrow();
    expect(correo.para).toEqual([{ email: 'usuario_uno@prueba.local', nombre: 'usuario_uno' }]);
    expect(correo.cc?.map((c) => c.email).sort()).toEqual(['externo@proveedor.com', 'usuario_dos@prueba.local']);
    expect(correo.asunto).toBe('Ticket ASCA-0001 creado · Cancelación');
    for (const texto of ['ASCA-0001', 'Cancelación', 'Autotransportes Asturcones', 'Compras', 'CARTA PORTE', 'B12345', 'Pendiente', 'Ver ticket en el sistema']) {
      expect(correo.cuerpo_html).toContain(texto);
    }
    expect(correo.cuerpo_html).toContain(`http://localhost:3100/tickets/${t.id}`);
  });

  it('el HTML se guarda sanitizado (sin scripts ni eventos)', async () => {
    const r = await u1.form('/tickets', ticketValido(f, { descripcionHtml: '<p onmouseover="x()">Hola<script>alert(1)</script><img src=x onerror=alert(1)></p>' }));
    const d = await u1.get(`/tickets/${r.body.id}`);
    expect(d.body.descripcionHtml).toBe('<p>Hola</p>');
  });

  it('los consecutivos son independientes por prefijo (empresa + tipo)', async () => {
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('ASCA-0001');
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('ASCA-0002');
    expect((await u1.form('/tickets', { ...ticketValido(f), tipoId: f.tipoCG })).body.folio).toBe('ASCG-0001');
    const u2 = await entrar('usuario_dos');
    expect((await u2.form('/tickets', { ...ticketValido(f), empresaId: f.empresaMA })).body.folio).toBe('MACA-0001');
  });

  it('50 tickets creados al mismo tiempo reciben 50 folios distintos y consecutivos', async () => {
    const respuestas = await Promise.all(Array.from({ length: 50 }, () => u1.form('/tickets', ticketValido(f))));
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    const folios = respuestas.map((r) => r.body.folio as string).sort();
    expect(new Set(folios).size).toBe(50);
    expect(folios[0]).toBe('ASCA-0001');
    expect(folios[49]).toBe('ASCA-0050');
  });

  it('si la transacción se revierte, el consecutivo también (no quedan huecos)', async () => {
    await db
      .transaction()
      .execute(async (tx) => {
        expect(await siguienteConsecutivo(tx, 'ZZZZ')).toBe(1);
        throw new Error('revertir');
      })
      .catch(() => undefined);
    await db.transaction().execute(async (tx) => {
      expect(await siguienteConsecutivo(tx, 'ZZZZ')).toBe(1);
    });
  });

  it('si ya existe el folio (p. ej. importado), toma el siguiente libre', async () => {
    await db.insertInto('folio_consecutivos').values({ prefijo: 'ASCA', ultimo: 0 }).execute();
    await u1.form('/tickets', ticketValido(f));
    await db.updateTable('folio_consecutivos').set({ ultimo: 0 }).where('prefijo', '=', 'ASCA').execute();
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('ASCA-0002');
  });

  it.each([
    ['sin tipo', { tipoId: undefined }, 'tipoId'],
    ['tipo inexistente', { tipoId: 9999 }, 'tipoId'],
    ['sin módulo en un tipo que lo exige', { moduloId: null }, 'moduloId'],
    ['sin concepto', { concepto: '' }, 'concepto'],
    ['sin folio(s) en Cancelación', { foliosRef: '' }, 'foliosRef'],
    ['descripción vacía del editor', { descripcionHtml: '<p></p>' }, 'descripcionHtml'],
    ['descripción solo con script', { descripcionHtml: '<script>alert(1)</script>' }, 'descripcionHtml'],
    ['concepto de más de 200 caracteres', { concepto: 'x'.repeat(201) }, 'concepto'],
    ['correo en copia inválido', { copias: [{ email: 'no-correo' }] }, 'copias.0.email'],
  ])('validación: %s → 400', async (_n, cambio, campo) => {
    const r = await u1.form('/tickets', { ...ticketValido(f), ...cambio });
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty(campo);
  });

  it('no se puede crear con una empresa no asignada', async () => {
    const r = await u1.form('/tickets', ticketValido(f, { empresaId: f.empresaMA }));
    expect(r.status).toBe(400);
    expect(r.body.error.campos.empresaId).toMatch(/no está asignada/);
  });

  it('un usuario no puede crear a nombre de otro; el admin sí', async () => {
    expect((await u1.form('/tickets', ticketValido(f, { solicitanteId: f.u2 }))).status).toBe(403);
    const admin = await entrar('admin_prueba');
    const r = await admin.form('/tickets', ticketValido(f, { solicitanteId: f.u1 }));
    expect(r.status).toBe(201);
    const d = await u1.get(`/tickets/${r.body.id}`);
    expect(d.body.solicitante.id).toBe(f.u1);
    expect(d.body.creadoPor.username).toBe('admin_prueba');
  });

  it('formulario sin "datos" o con JSON roto → 400', async () => {
    const r = await u1.agente.post('/api/tickets').set('X-CSRF-Token', u1.csrf).field('datos', '{roto');
    expect(r.status).toBe(400);
  });
});

describe('visibilidad: nadie ve tickets ajenos', () => {
  it('el usuario ve solo los suyos; un ticket ajeno responde 404 (no revela que existe)', async () => {
    const u2 = await entrar('usuario_dos');
    const propio = await u1.form('/tickets', ticketValido(f));
    await u2.form('/tickets', ticketValido(f, { empresaId: f.empresaMA }));

    const lista = await u2.get('/tickets');
    expect(lista.body.total).toBe(1);
    expect(lista.body.contadores.total).toBe(1);
    expect(lista.body.datos[0].folio).toBe('MACA-0001');

    for (const r of [
      await u2.get(`/tickets/${propio.body.id}`),
      await u2.form(`/tickets/${propio.body.id}/comentarios`, { html: '<p>hola</p>' }),
    ]) {
      expect(r.status).toBe(404);
    }
    // Ni filtrando por su id ni buscando su folio.
    expect((await u2.get(`/tickets?solicitanteId=${f.u1}`)).body.total).toBe(0);
    expect((await u2.get('/tickets?q=ASCA-0001')).body.total).toBe(0);
  });

  it('el admin ve todos', async () => {
    const u2 = await entrar('usuario_dos');
    await u1.form('/tickets', ticketValido(f));
    await u2.form('/tickets', ticketValido(f, { empresaId: f.empresaMA }));
    const admin = await entrar('admin_prueba');
    expect((await admin.get('/tickets')).body.total).toBe(2);
  });
});

describe('lista, búsqueda y filtros', () => {
  beforeEach(async () => {
    await u1.form('/tickets', ticketValido(f, { concepto: 'CARTA PORTE', foliosRef: 'B12345' }));
    await u1.form('/tickets', ticketValido(f, { concepto: 'Ajuste de inventario', foliosRef: 'INV-1024', descripcionHtml: '<p>Nómina de septiembre</p>' }));
    await u1.form('/tickets', { tipoId: f.tipoCG, empresaId: f.empresaAS, concepto: 'Duda de bancos', descripcionHtml: '<p>pregunta</p>' });
  });

  it('búsqueda por folio, concepto, folio(s), texto (sin acentos) y empresa', async () => {
    const admin = await entrar('admin_prueba');
    const total = async (q: string) => (await admin.get(`/tickets?q=${encodeURIComponent(q)}`)).body.total;
    expect(await total('ASCA-0002')).toBe(1);
    expect(await total('asca')).toBe(2);
    expect(await total('carta')).toBe(1);
    expect(await total('INV-1024')).toBe(1);
    expect(await total('nomina')).toBe(1);
    expect(await total('Asturcones')).toBe(3);
    expect(await total('usuario_uno')).toBe(3);
    expect(await total('no existe nada así')).toBe(0);
    expect(await total('%')).toBe(0);
  });

  it('filtros por estatus, tipo, técnico y fechas; contadores por estatus', async () => {
    const admin = await entrar('admin_prueba');
    const t = (await admin.get('/tickets?q=carta')).body.datos[0];
    await admin.post(`/tickets/${t.id}/tomar`).expect(204);

    const r = await admin.get('/tickets?estatus=PENDIENTE');
    expect(r.body.total).toBe(2);
    expect(r.body.contadores).toEqual({ total: 3, PENDIENTE: 2, EN_PROCESO: 1, PAUSADO: 0, COMPLETADO: 0 });
    expect((await admin.get(`/tickets?tipoId=${f.tipoCG}`)).body.total).toBe(1);
    expect((await admin.get(`/tickets?asignadoAId=${f.admin}`)).body.total).toBe(1);
    expect((await admin.get('/tickets?asignadoAId=ninguno')).body.total).toBe(2);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    expect((await admin.get(`/tickets?desde=${hoy}&hasta=${hoy}`)).body.total).toBe(3);
    expect((await admin.get('/tickets?hasta=2020-01-01')).body.total).toBe(0);
  });

  it('paginación en servidor', async () => {
    const p1 = await u1.get('/tickets?porPagina=2&pagina=1');
    const p2 = await u1.get('/tickets?porPagina=2&pagina=2');
    expect(p1.body.datos).toHaveLength(2);
    expect(p2.body.datos).toHaveLength(1);
    expect(p1.body.total).toBe(3);
    const ids = [...p1.body.datos, ...p2.body.datos].map((t: { id: number }) => t.id);
    expect(new Set(ids).size).toBe(3);
    // Los más recientes primero.
    expect(p1.body.datos[0].id).toBeGreaterThan(p2.body.datos[0].id);
  });

  it('parámetros inválidos → 400', async () => {
    for (const q of ['estatus=OTRO', 'porPagina=500', 'desde=ayer', 'pagina=0', 'tipoId=abc']) {
      expect((await u1.get(`/tickets?${q}`)).status).toBe(400);
    }
  });
});
