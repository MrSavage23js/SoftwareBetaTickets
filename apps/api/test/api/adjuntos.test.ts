import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RUTAS } from '../../src/config/env';
import { db } from '../../src/db/conexion';
import { entrar, PDF, PNG, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let u1: Cliente;
let u2: Cliente;
let admin: Cliente;
beforeEach(async () => {
  f = await reiniciarBD();
  [u1, u2, admin] = await Promise.all([entrar('usuario_uno'), entrar('usuario_dos'), entrar('admin_prueba')]);
});
afterAll(async () => {
  await db.destroy();
});

const archivosEnDisco = () =>
  existsSync(RUTAS.adjuntos) ? readdirSync(RUTAS.adjuntos, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0;

describe('subida con el ticket', () => {
  it('guarda PDF e imagen con nombre aleatorio fuera de la carpeta pública', async () => {
    const r = await u1.form('/tickets', ticketValido(f), [
      { nombre: 'Factura Nº 12.pdf', contenido: PDF },
      { nombre: 'captura.png', contenido: PNG },
    ]);
    expect(r.status).toBe(201);
    const d = (await u1.get(`/tickets/${r.body.id}`)).body;
    expect(d.adjuntos.map((a: { nombre: string; mime: string }) => [a.nombre, a.mime])).toEqual([
      ['Factura Nº 12.pdf', 'application/pdf'],
      ['captura.png', 'image/png'],
    ]);
    const filas = await db.selectFrom('adjuntos').select(['ruta_relativa', 'sha256']).execute();
    for (const a of filas) {
      expect(a.ruta_relativa).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      expect(existsSync(join(RUTAS.adjuntos, a.ruta_relativa))).toBe(true);
    }
    expect(RUTAS.adjuntos.startsWith(join(RUTAS.storage))).toBe(true);
  });

  it.each([
    ['extensión no permitida', 'programa.exe', Buffer.from('MZ\x90\x00')],
    ['un ejecutable disfrazado de PDF', 'factura.pdf', Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff')],
    ['texto disfrazado de imagen', 'foto.png', Buffer.from('esto no es una imagen')],
    ['HTML disfrazado de TXT (contenido binario)', 'nota.txt', Buffer.from([0x00, 0x01, 0x02, 0x03])],
    ['archivo vacío', 'vacio.pdf', Buffer.alloc(0)],
    ['sin extensión', 'archivo', PDF],
  ])('rechaza %s y no crea el ticket ni deja archivos', async (_n, nombre, contenido) => {
    const r = await u1.form('/tickets', ticketValido(f), [{ nombre, contenido }]);
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('ARCHIVO_INVALIDO');
    expect((await db.selectFrom('tickets').select('id').execute()).length).toBe(0);
    expect(archivosEnDisco()).toBe(0);
    expect(readdirSync(RUTAS.temporales)).toEqual([]);
  });

  it('respeta el tamaño máximo y la cantidad máxima configurados', async () => {
    await admin.put('/ajustes', { 'adjuntos.max_mb': 1, 'adjuntos.max_por_mensaje': 2 }).expect(200);
    const grande = Buffer.concat([PDF, Buffer.alloc(1024 * 1024 + 10)]);
    expect((await u1.form('/tickets', ticketValido(f), [{ nombre: 'grande.pdf', contenido: grande }])).status).toBe(400);
    const tres = [1, 2, 3].map((i) => ({ nombre: `f${i}.pdf`, contenido: PDF }));
    const r = await u1.form('/tickets', ticketValido(f), tres);
    expect(r.status).toBe(400);
    expect(r.body.error.mensaje).toMatch(/como máximo 2/);
  });

  it('si la BD rechaza el ticket, los archivos ya guardados se borran', async () => {
    const r = await u1.form('/tickets', ticketValido(f, { concepto: '' }), [{ nombre: 'a.pdf', contenido: PDF }]);
    expect(r.status).toBe(400);
    expect(archivosEnDisco()).toBe(0);
  });
});

describe('descarga protegida', () => {
  it('el dueño y soporte descargan; otro usuario recibe 404; sin sesión 401', async () => {
    const r = await u1.form('/tickets', ticketValido(f), [{ nombre: 'factura.pdf', contenido: PDF }]);
    const url = (await u1.get(`/tickets/${r.body.id}`)).body.adjuntos[0].url as string;

    const propia = await u1.agente.get(url);
    expect(propia.status).toBe(200);
    expect(propia.headers['content-type']).toBe('application/pdf');
    expect(propia.headers['x-content-type-options']).toBe('nosniff');
    expect(propia.headers['content-disposition']).toMatch(/^inline; filename="factura.pdf"/);
    expect((await admin.agente.get(url)).status).toBe(200);
    expect((await u2.agente.get(url)).status).toBe(404);
    expect((await (await import('../ayudas')).anonimo().get(url)).status).toBe(401);
  });

  it('los archivos que no son imagen ni PDF siempre se descargan (no se abren en el navegador)', async () => {
    const r = await u1.form('/tickets', ticketValido(f), [{ nombre: 'datos.csv', contenido: 'a,b\n1,2\n' }]);
    const url = (await u1.get(`/tickets/${r.body.id}`)).body.adjuntos[0].url as string;
    const d = await u1.agente.get(url);
    expect(d.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('uuid inválido o inexistente → 404', async () => {
    expect((await u1.agente.get('/api/adjuntos/../../.env')).status).toBe(404);
    expect((await u1.agente.get('/api/adjuntos/0b1f5a2c-3d4e-4f60-8a9b-0c1d2e3f4a5b')).status).toBe(404);
  });
});

describe('imágenes insertadas en el editor', () => {
  it('se suben como temporales, solo las ve quien las subió y se ligan al ticket al crearlo', async () => {
    const sub = await u1.agente.post('/api/adjuntos/temporal').set('X-CSRF-Token', u1.csrf).attach('archivo', PNG, 'pegada.png');
    expect(sub.status).toBe(201);
    const { uuid, url } = sub.body as { uuid: string; url: string };
    expect((await u1.agente.get(url)).status).toBe(200);
    expect((await u2.agente.get(url)).status).toBe(404);

    const r = await u1.form('/tickets', ticketValido(f, { descripcionHtml: `<p>Mira:</p><img src="${url}">` }));
    const a = await db.selectFrom('adjuntos').selectAll().where('uuid', '=', uuid).executeTakeFirstOrThrow();
    expect(a).toMatchObject({ ticket_id: r.body.id, en_linea: 1 });
    expect((await admin.agente.get(url)).status).toBe(200);
    // Las imágenes en línea no se listan como "archivos adjuntos".
    expect((await u1.get(`/tickets/${r.body.id}`)).body.adjuntos).toEqual([]);
  });

  it('no se puede "robar" la imagen temporal de otro usuario poniendo su uuid', async () => {
    const sub = await u2.agente.post('/api/adjuntos/temporal').set('X-CSRF-Token', u2.csrf).attach('archivo', PNG, 'ajena.png');
    await u1.form('/tickets', ticketValido(f, { descripcionHtml: `<p>x</p><img src="${sub.body.url}">` })).expect(201);
    const a = await db.selectFrom('adjuntos').select('ticket_id').where('uuid', '=', sub.body.uuid).executeTakeFirstOrThrow();
    expect(a.ticket_id).toBeNull();
  });

  it('solo acepta imágenes', async () => {
    const r = await u1.agente.post('/api/adjuntos/temporal').set('X-CSRF-Token', u1.csrf).attach('archivo', PDF, 'doc.pdf');
    expect(r.status).toBe(400);
  });
});
