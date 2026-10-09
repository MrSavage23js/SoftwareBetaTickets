import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { entrar, reiniciarBD, type Cliente, type Fixtures } from '../ayudas';

let f: Fixtures;
let admin: Cliente;
let u1: Cliente; // departamento SIS
let u2: Cliente; // departamento RH
beforeEach(async () => {
  f = await reiniciarBD();
  [admin, u1, u2] = await Promise.all([entrar('admin_prueba'), entrar('usuario_uno'), entrar('usuario_dos')]);
});
afterAll(async () => {
  await db.destroy();
});

const titulos = (r: { body: { titulo: string }[] }) => r.body.map((a) => a.titulo);

describe('anuncios', () => {
  it('uno para todos se ve en cuanto se manda y desaparece al retirarlo', async () => {
    const r = await admin.post('/anuncios', { titulo: 'Mantenimiento', mensaje: 'El sábado no habrá sistema.', tipo: 'ADVERTENCIA' }).expect(201);
    expect(r.body[0]).toMatchObject({ titulo: 'Mantenimiento', activo: true, departamentos: [], autor: 'admin_prueba', cerrados: 0 });

    expect((await u1.get('/anuncios/mios').expect(200)).body[0]).toMatchObject({ titulo: 'Mantenimiento', tipo: 'ADVERTENCIA', cerrable: true });
    expect(titulos(await u2.get('/anuncios/mios'))).toEqual(['Mantenimiento']);
    expect(titulos(await admin.get('/anuncios/mios'))).toEqual(['Mantenimiento']);

    const retirado = await admin.post(`/anuncios/${r.body[0].id}/retirar`).expect(200);
    expect(retirado.body[0]).toMatchObject({ activo: false });
    expect(retirado.body[0].retiradoAt).toBeTruthy();
    expect((await u1.get('/anuncios/mios')).body).toEqual([]);
  });

  it('por departamento: solo lo ven los de ese departamento', async () => {
    await admin.post('/anuncios', { titulo: 'Solo RH', mensaje: 'Junta a las 5.', tipo: 'INFO', departamentoIds: [f.deptoRH] }).expect(201);
    const lista = await admin.get('/anuncios').expect(200);
    expect(lista.body[0].departamentos).toEqual([{ id: f.deptoRH, nombre: expect.any(String) }]);

    expect(titulos(await u2.get('/anuncios/mios'))).toEqual(['Solo RH']);
    expect((await u1.get('/anuncios/mios')).body).toEqual([]);
    // El admin no tiene departamento: solo ve los que son para todos.
    expect((await admin.get('/anuncios/mios')).body).toEqual([]);
  });

  it('cerrarlo lo oculta solo para ese usuario; los urgentes no se cierran', async () => {
    await admin.post('/anuncios', { titulo: 'Info', mensaje: 'Nuevo formato de folios.', tipo: 'INFO' }).expect(201);
    const r = await admin.post('/anuncios', { titulo: 'Caída', mensaje: 'El correo está caído.', tipo: 'URGENTE' }).expect(201);
    const [urgente, info] = r.body as { id: number; titulo: string }[];

    // Los urgentes van primero.
    expect(titulos(await u1.get('/anuncios/mios'))).toEqual(['Caída', 'Info']);
    await u1.post(`/anuncios/${info!.id}/cerrar`).expect(204);
    await u1.post(`/anuncios/${info!.id}/cerrar`).expect(204); // dos veces no falla
    expect(titulos(await u1.get('/anuncios/mios'))).toEqual(['Caída']);
    expect(titulos(await u2.get('/anuncios/mios'))).toEqual(['Caída', 'Info']);
    expect((await admin.get('/anuncios')).body.find((a: { id: number }) => a.id === info!.id).cerrados).toBe(1);

    expect((await u1.post(`/anuncios/${urgente!.id}/cerrar`)).status).toBe(409);
    expect((await u1.post('/anuncios/9999/cerrar')).status).toBe(404);
  });

  it('borrar lo quita del historial', async () => {
    const r = await admin.post('/anuncios', { titulo: 'Temporal', mensaje: 'x', tipo: 'INFO' }).expect(201);
    expect((await admin.del(`/anuncios/${r.body[0].id}`).expect(200)).body).toEqual([]);
    expect((await admin.del(`/anuncios/${r.body[0].id}`)).status).toBe(404);
  });

  it('valida los datos', async () => {
    const vacio = await admin.post('/anuncios', { titulo: ' ', mensaje: '', tipo: 'INFO' });
    expect(vacio.status).toBe(400);
    expect(vacio.body.error.campos).toHaveProperty('titulo');
    expect((await admin.post('/anuncios', { titulo: 'x', mensaje: 'x', tipo: 'OTRO' })).status).toBe(400);
    const largo = await admin.post('/anuncios', { titulo: 'x', mensaje: 'a'.repeat(501), tipo: 'INFO' });
    expect(largo.body.error.campos).toHaveProperty('mensaje');
    const depto = await admin.post('/anuncios', { titulo: 'x', mensaje: 'x', tipo: 'INFO', departamentoIds: [99999] });
    expect(depto.status).toBe(400);
    expect(depto.body.error.campos).toHaveProperty('departamentoIds');
    expect((await admin.post('/anuncios', { titulo: 'x', mensaje: 'x', tipo: 'INFO', departamentoIds: [99] })).status).toBe(400);
  });

  it('solo los admins los mandan y administran', async () => {
    expect((await u1.get('/anuncios')).status).toBe(403);
    expect((await u1.post('/anuncios', { titulo: 'x', mensaje: 'x', tipo: 'INFO' })).status).toBe(403);
    const r = await admin.post('/anuncios', { titulo: 'Hola', mensaje: 'x', tipo: 'INFO' }).expect(201);
    expect((await u1.post(`/anuncios/${r.body[0].id}/retirar`)).status).toBe(403);
    expect((await u1.del(`/anuncios/${r.body[0].id}`)).status).toBe(403);
  });
});
