import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { entrar, reiniciarBD, ticketValido, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let admin: Cliente;
beforeEach(async () => {
  f = await reiniciarBD();
  admin = await entrar('admin_prueba');
});
afterAll(async () => {
  await db.destroy();
});

describe('catálogos', () => {
  it('datos iniciales: 17 empresas, 6 tipos, 7 módulos y 4 estatus', async () => {
    const r = await admin.get('/catalogos');
    expect(r.body.empresas).toHaveLength(17);
    expect(r.body.tipos.map((t: { nombre: string }) => t.nombre)).toEqual([
      'Corrección',
      'Cancelación',
      'Alta en catálogo',
      'Cambio de estructura',
      'Consulta General',
      'Mantenimiento a equipo o instalación',
    ]);
    expect(r.body.modulos).toHaveLength(7);
    expect(r.body.estatus.map((e: { codigo: string }) => e.codigo)).toEqual(['PENDIENTE', 'EN_PROCESO', 'PAUSADO', 'COMPLETADO']);
  });

  it('el solicitante solo ve sus empresas asignadas', async () => {
    const u1 = await entrar('usuario_uno');
    expect((await u1.get('/catalogos')).body.empresas.map((e: { codigo: string }) => e.codigo)).toEqual(['AS']);
    // Pedir modo admin sin permiso no da más datos.
    expect((await u1.get('/catalogos?admin=1')).body.empresas).toHaveLength(1);
  });

  it('crear empresa; código duplicado o inválido se rechaza', async () => {
    const ok = await admin.post('/catalogos/empresas', { nombre: 'Nueva Empresa', codigo: 'ne' });
    expect(ok.status).toBe(201);
    expect((await admin.post('/catalogos/empresas', { nombre: 'Otra', codigo: 'NE' })).status).toBe(409);
    expect((await admin.post('/catalogos/empresas', { nombre: 'Aram_Wax', codigo: 'ZZ' })).status).toBe(409);
    const malo = await admin.post('/catalogos/empresas', { nombre: 'Otra', codigo: 'N E' });
    expect(malo.status).toBe(400);
    expect(malo.body.error.campos).toHaveProperty('codigo');
  });

  it('desactivar un tipo lo quita del formulario pero los tickets viejos lo conservan', async () => {
    const u1 = await entrar('usuario_uno');
    const t = await u1.form('/tickets', ticketValido(f));
    const tipo = (await admin.get('/catalogos?admin=1')).body.tipos.find((x: { id: number }) => x.id === f.tipoCA);
    await admin.put(`/catalogos/tipos/${f.tipoCA}`, { ...tipo, activo: false }).expect(200);

    expect((await u1.get('/catalogos')).body.tipos.some((x: { id: number }) => x.id === f.tipoCA)).toBe(false);
    expect((await u1.get(`/tickets/${t.body.id}`)).body.tipo.nombre).toBe('Cancelación');
    const nuevo = await u1.form('/tickets', ticketValido(f));
    expect(nuevo.status).toBe(400);
    expect(nuevo.body.error.campos).toHaveProperty('tipoId');
  });

  it('cambiar el código de una empresa con tickets avisa y el siguiente folio usa el código nuevo', async () => {
    const u1 = await entrar('usuario_uno');
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('ASCA-0001');
    const r = await admin.put(`/catalogos/empresas/${f.empresaAS}`, { nombre: 'Autotransportes Asturcones', codigo: 'AT', activa: true, orden: 3 });
    expect(r.body.advertencia).toMatch(/folios ya emitidos no cambian/);
    expect((await u1.form('/tickets', ticketValido(f))).body.folio).toBe('ATCA-0001');
    expect((await u1.get('/tickets?q=ASCA-0001')).body.total).toBe(1);
  });

  it('tipo con módulo opcional permite crear sin módulo', async () => {
    const u1 = await entrar('usuario_uno');
    const r = await u1.form('/tickets', { tipoId: f.tipoCG, empresaId: f.empresaAS, concepto: 'Duda', descripcionHtml: '<p>¿Cómo…?</p>' });
    expect(r.status).toBe(201);
    expect(r.body.folio).toBe('ASCG-0001');
  });
});

describe('ajustes', () => {
  it('lista y actualiza; se aplica de inmediato', async () => {
    const r = await admin.get('/ajustes');
    expect(r.body.ajustes.find((a: { clave: string }) => a.clave === 'sesion.inactividad_min').valor).toBe(30);
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET|PASS/);
    await admin.put('/ajustes', { 'adjuntos.max_por_mensaje': 2 }).expect(200);
    const u1 = await entrar('usuario_uno');
    expect((await u1.get('/auth/yo')).body.usuario.adjuntos.maxPorMensaje).toBe(2);
  });

  it.each([
    [{ 'sesion.inactividad_min': 1 }, 'sesion.inactividad_min'],
    [{ 'adjuntos.max_mb': 9999 }, 'adjuntos.max_mb'],
    [{ 'adjuntos.tipos': ['exe;rm'] }, 'adjuntos.tipos'],
    [{ 'correo.aviso_soporte_destino': 'no-correo' }, 'correo.aviso_soporte_destino'],
    [{ 'clave.inventada': 1 }, 'clave.inventada'],
  ])('valor inválido %j → 400', async (cambio, campo) => {
    const r = await admin.put('/ajustes', cambio);
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty(campo);
  });
});
