import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { anioActual, CONTADOR_CONTINUO, siguienteConsecutivo } from '../../src/modulos/tickets/folio';
import { up as migrarFolioContinuo } from '../../src/db/migraciones/0004_folio_continuo';
import { ANIO, entrar, folio, quitarDepartamento, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

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
    expect(r.body).toEqual({ id: expect.any(Number), folio: folio('SIS', 1), correosEncolados: 1 });

    const t = await db.selectFrom('tickets').selectAll().where('id', '=', r.body.id).executeTakeFirstOrThrow();
    expect(t).toMatchObject({ estatus: 'PENDIENTE', solicitante_id: f.u1, creado_por_id: f.u1, asignado_a_id: null });
    const eventos = await db.selectFrom('ticket_eventos').select('tipo').where('ticket_id', '=', t.id).execute();
    expect(eventos.map((e) => e.tipo)).toEqual(['CREADO']);
    const correo = await db.selectFrom('correos_salida').selectAll().where('ticket_id', '=', t.id).executeTakeFirstOrThrow();
    expect(correo.para).toEqual([{ email: 'usuario_uno@prueba.local', nombre: 'usuario_uno' }]);
    expect(correo.cc?.map((c) => c.email).sort()).toEqual(['externo@proveedor.com', 'usuario_dos@prueba.local']);
    // El folio va al inicio del asunto, para identificarlo y buscarlo en Outlook.
    expect(correo.asunto).toBe(`[${folio('SIS', 1)}] Ticket creado · Cancelación`);
    for (const texto of [folio('SIS', 1), 'Sistemas / TI', 'Cancelación', 'Autotransportes Asturcones', 'Compras', 'CARTA PORTE', 'B12345', 'Pendiente', 'Ver ticket en el sistema']) {
      expect(correo.cuerpo_html).toContain(texto);
    }
    expect(correo.cuerpo_html).toContain(`http://localhost:3100/tickets/${t.id}`);
  });

  it('el HTML se guarda sanitizado (sin scripts ni eventos)', async () => {
    const r = await u1.form('/tickets', ticketValido(f, { descripcionHtml: '<p onmouseover="x()">Hola<script>alert(1)</script><img src=x onerror=alert(1)></p>' }));
    const d = await u1.get(`/tickets/${r.body.id}`);
    expect(d.body.descripcionHtml).toBe('<p>Hola</p>');
  });

  it('folio DEPTO-CONSECUTIVO: consecutivo independiente por departamento, sin importar empresa ni tipo', async () => {
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe(folio('SIS', 1));
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe(folio('SIS', 2));
    expect((await u1.form('/tickets', { ...ticketValido(f), tipoId: f.tipoCG })).body.folio).toBe(folio('SIS', 3));
    const u2 = await entrar('usuario_dos');
    expect((await u2.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH, empresaId: f.empresaMA }))).body.folio).toBe(folio('RH', 1));
    expect(folio('SIS', 1)).toBe('SIS-0001');
  });

  it('quien tiene departamento asignado siempre crea con el suyo; sin departamento lo elige; soporte elige cualquiera', async () => {
    // usuario_uno es de Sistemas: aunque mande Recursos Humanos, el ticket sale de Sistemas.
    const fijo = await u1.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH }));
    expect(fijo.body.folio).toBe(folio('SIS', 1));
    expect((await u1.get(`/tickets/${fijo.body.id}`)).body.departamento.nombre).toBe('Sistemas / TI');
    // Sin departamento asignado, elige.
    await quitarDepartamento(f.u1);
    expect((await u1.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH }))).body.folio).toBe(folio('RH', 1));
    // Soporte elige cualquiera (p. ej. al crear a nombre de alguien).
    await db.updateTable('usuarios').set({ departamento_id: f.deptoSIS }).where('id', '=', f.admin).execute();
    const admin = await entrar('admin_prueba');
    const r = await admin.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH, solicitanteId: f.u1 }));
    expect(r.body.folio).toBe(folio('RH', 2));
  });

  it('un contador continuo (sin año) por departamento', async () => {
    await quitarDepartamento(f.u1);
    await u1.form('/tickets', ticketValido(f));
    await u1.form('/tickets', ticketValido(f));
    await u1.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH }));
    const contadores = await db.selectFrom('folio_contadores').selectAll().orderBy('departamento').execute();
    expect(contadores.map((c) => [c.departamento, c.anio, c.ultimo_consecutivo])).toEqual([
      ['RH', CONTADOR_CONTINUO, 1],
      ['SIS', CONTADOR_CONTINUO, 2],
    ]);
  });

  it('el consecutivo no se reinicia con el año y no toca los contadores viejos con año', async () => {
    // Contador continuo a mitad de camino y un contador del formato anterior (SIS-2026-0047).
    await db.insertInto('folio_contadores').values([
      { departamento: 'SIS', anio: CONTADOR_CONTINUO, ultimo_consecutivo: 120 },
      { departamento: 'SIS', anio: ANIO, ultimo_consecutivo: 47 },
    ]).execute();
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('SIS-0121');
    const anterior = await db.selectFrom('folio_contadores').selectAll().where('anio', '=', ANIO).executeTakeFirstOrThrow();
    expect(anterior.ultimo_consecutivo).toBe(47);
  });

  it('la migración al folio continuo sigue desde el último número de cada departamento y reactiva RH', async () => {
    // Como estaba producción: SIS-2026-0007 y RH desactivado (con folios de dos años).
    await db.insertInto('folio_contadores').values([
      { departamento: 'SIS', anio: ANIO, ultimo_consecutivo: 7 },
      { departamento: 'RH', anio: ANIO - 1, ultimo_consecutivo: 3 },
      { departamento: 'RH', anio: ANIO, ultimo_consecutivo: 1 },
    ]).execute();
    await db.updateTable('departamentos').set({ activo: 0 }).where('codigo', '=', 'RH').execute();
    await migrarFolioContinuo(db as never);
    await quitarDepartamento(f.u1);
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('SIS-0008');
    expect((await u1.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH }))).body.folio).toBe('RH-0004');
  });

  it('el año se toma en la hora de México, no en UTC', () => {
    // 31 dic 2026, 11:30 p. m. en México = 1 ene 2027, 05:30 UTC.
    expect(anioActual(new Date('2027-01-01T05:30:00Z'))).toBe(2026);
    // 1 ene 2027, 12:30 a. m. en México.
    expect(anioActual(new Date('2027-01-01T06:30:00Z'))).toBe(2027);
  });

  it('50 tickets creados al mismo tiempo reciben 50 folios distintos y consecutivos', async () => {
    const respuestas = await Promise.all(Array.from({ length: 50 }, () => u1.form('/tickets', ticketValido(f))));
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    const folios = respuestas.map((r) => r.body.folio as string).sort();
    expect(new Set(folios).size).toBe(50);
    expect(folios[0]).toBe(folio('SIS', 1));
    expect(folios[49]).toBe(folio('SIS', 50));
  });

  it('si la transacción se revierte, el consecutivo también (no quedan huecos)', async () => {
    await db
      .transaction()
      .execute(async (tx) => {
        expect(await siguienteConsecutivo(tx, 'ZZZ')).toBe(1);
        throw new Error('revertir');
      })
      .catch(() => undefined);
    await db.transaction().execute(async (tx) => {
      expect(await siguienteConsecutivo(tx, 'ZZZ')).toBe(1);
    });
  });

  it('si ya existe el folio (p. ej. importado), toma el siguiente libre', async () => {
    await u1.form('/tickets', ticketValido(f));
    await db.updateTable('folio_contadores').set({ ultimo_consecutivo: 0 }).where('departamento', '=', 'SIS').execute();
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe(folio('SIS', 2));
  });

  it('un departamento desactivado ya no se puede usar', async () => {
    await quitarDepartamento(f.u1);
    await db.updateTable('departamentos').set({ activo: 0 }).where('id', '=', f.deptoRH).execute();
    const r = await u1.form('/tickets', ticketValido(f, { departamentoId: f.deptoRH }));
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty('departamentoId');
  });

  it.each([
    ['sin tipo', { tipoId: undefined }, 'tipoId'],
    ['sin departamento', { departamentoId: undefined }, 'departamentoId'],
    ['departamento inexistente', { departamentoId: 9999 }, 'departamentoId'],
    ['tipo inexistente', { tipoId: 9999 }, 'tipoId'],
    ['sin módulo en un tipo que lo exige', { moduloId: null }, 'moduloId'],
    ['sin concepto', { concepto: '' }, 'concepto'],
    ['sin folio(s) en Cancelación', { foliosRef: '' }, 'foliosRef'],
    ['descripción vacía del editor', { descripcionHtml: '<p></p>' }, 'descripcionHtml'],
    ['descripción solo con script', { descripcionHtml: '<script>alert(1)</script>' }, 'descripcionHtml'],
    ['concepto de más de 200 caracteres', { concepto: 'x'.repeat(201) }, 'concepto'],
    ['correo en copia inválido', { copias: [{ email: 'no-correo' }] }, 'copias.0.email'],
  ])('validación: %s → 400', async (_n, cambio, campo) => {
    await quitarDepartamento(f.u1);
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
    // usuario_dos es de Recursos Humanos: su ticket sale con su departamento.
    expect(lista.body.datos[0].folio).toBe(folio('RH', 1));

    for (const r of [
      await u2.get(`/tickets/${propio.body.id}`),
      await u2.form(`/tickets/${propio.body.id}/comentarios`, { html: '<p>hola</p>' }),
    ]) {
      expect(r.status).toBe(404);
    }
    // Ni filtrando por su id ni buscando su folio.
    expect((await u2.get(`/tickets?solicitanteId=${f.u1}`)).body.total).toBe(0);
    expect((await u2.get(`/tickets?q=${folio('SIS', 1)}`)).body.total).toBe(0);
  });

  it('la búsqueda de texto solo encuentra tickets visibles para quien busca', async () => {
    const u2 = await entrar('usuario_dos');
    await u1.form('/tickets', ticketValido(f, { concepto: 'Inventario de almacén' }));
    await u2.form('/tickets', ticketValido(f, { empresaId: f.empresaMA, concepto: 'Inventario de planta' }));
    const r = await u1.get('/tickets?q=inventario');
    expect(r.body.total).toBe(1);
    expect(r.body.datos[0].concepto).toBe('Inventario de almacén');
    const admin = await entrar('admin_prueba');
    expect((await admin.get('/tickets?q=inventario')).body.total).toBe(2);
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
    await quitarDepartamento(f.u1);
    await u1.form('/tickets', ticketValido(f, { concepto: 'CARTA PORTE', foliosRef: 'B12345' }));
    await u1.form('/tickets', ticketValido(f, { concepto: 'Ajuste de inventario', foliosRef: 'INV-1024', descripcionHtml: '<p>Nómina de septiembre</p>' }));
    await u1.form('/tickets', { tipoId: f.tipoCG, departamentoId: f.deptoRH, empresaId: f.empresaAS, concepto: 'Duda de bancos', descripcionHtml: '<p>pregunta</p>' });
  });

  it('búsqueda por folio, concepto, folio(s), texto (sin acentos) y empresa', async () => {
    const admin = await entrar('admin_prueba');
    const total = async (q: string) => (await admin.get(`/tickets?q=${encodeURIComponent(q)}`)).body.total;
    expect(await total(folio('SIS', 2))).toBe(1);
    expect(await total('sis-')).toBe(2);
    expect(await total(folio('RH', 1))).toBe(1);
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
    expect(r.body.contadores).toEqual({ total: 3, PENDIENTE: 2, EN_PROCESO: 1, PAUSADO: 0, COMPLETADO: 0, NO_PROCEDE: 0 });
    expect((await admin.get(`/tickets?tipoId=${f.tipoCG}`)).body.total).toBe(1);
    expect((await admin.get(`/tickets?departamentoId=${f.deptoSIS}`)).body.total).toBe(2);
    expect((await admin.get(`/tickets?departamentoId=${f.deptoRH}`)).body.datos[0].departamento.nombre).toBe('Recursos Humanos');
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
