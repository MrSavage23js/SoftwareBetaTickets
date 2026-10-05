import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { entrar, reiniciarBD, type Cliente } from '../ayudas';

let admin: Cliente;
let tecnico: Cliente;
beforeEach(async () => {
  await reiniciarBD();
  [admin, tecnico] = await Promise.all([entrar('admin_prueba'), entrar('tecnico_prueba')]);
});
afterAll(async () => {
  await db.destroy();
});

describe('respuestas guardadas', () => {
  it('crear, listar en orden, editar y borrar las propias', async () => {
    expect((await admin.get('/respuestas')).body).toEqual([]);
    await admin
      .post('/respuestas', { titulo: 'Reinicio', cuerpoHtml: '<p>Reinicia el equipo, por favor.</p>' })
      .expect(201);
    const r = await admin
      .post('/respuestas', { titulo: 'Acceso', cuerpoHtml: '<p>Ya tienes <strong>acceso</strong>.</p>' })
      .expect(201);
    expect(r.body.map((x: { titulo: string }) => x.titulo)).toEqual(['Acceso', 'Reinicio']);

    const [acceso] = r.body as { id: number }[];
    const editada = await admin
      .put(`/respuestas/${acceso!.id}`, { titulo: 'Acceso listo', cuerpoHtml: '<p>Listo.</p>' })
      .expect(200);
    expect(editada.body[0]).toMatchObject({ titulo: 'Acceso listo', cuerpoHtml: '<p>Listo.</p>' });

    const borrada = await admin.del(`/respuestas/${acceso!.id}`).expect(200);
    expect(borrada.body.map((x: { titulo: string }) => x.titulo)).toEqual(['Reinicio']);
  });

  it('cada técnico ve y cambia solo las suyas', async () => {
    const r = await admin.post('/respuestas', { titulo: 'Mía', cuerpoHtml: '<p>Hola</p>' }).expect(201);
    const id = (r.body as { id: number }[])[0]!.id;
    expect((await tecnico.get('/respuestas')).body).toEqual([]);
    expect(
      (await tecnico.put(`/respuestas/${id}`, { titulo: 'Robada', cuerpoHtml: '<p>x</p>' })).status,
    ).toBe(404);
    expect((await tecnico.del(`/respuestas/${id}`)).status).toBe(404);
    expect((await admin.get('/respuestas')).body).toHaveLength(1);
  });

  it('limpia el HTML, quita imágenes y exige título y texto', async () => {
    const r = await admin
      .post('/respuestas', {
        titulo: 'Con trampa',
        cuerpoHtml:
          '<p onclick="x()">Hola<script>alert(1)</script></p><img src="/api/adjuntos/00000000-0000-0000-0000-000000000000">',
      })
      .expect(201);
    expect(r.body[0].cuerpoHtml).toBe('<p>Hola</p>');

    const vacia = await admin.post('/respuestas', { titulo: 'Vacía', cuerpoHtml: '<p></p>' });
    expect(vacia.status).toBe(400);
    expect(vacia.body.error.campos).toHaveProperty('cuerpoHtml');
    const sinTitulo = await admin.post('/respuestas', { titulo: '  ', cuerpoHtml: '<p>Hola</p>' });
    expect(sinTitulo.status).toBe(400);
    expect(sinTitulo.body.error.campos).toHaveProperty('titulo');
  });

  it('quien no atiende tickets no tiene respuestas guardadas', async () => {
    const u1 = await entrar('usuario_uno');
    expect((await u1.get('/respuestas')).status).toBe(403);
    expect((await u1.post('/respuestas', { titulo: 'x', cuerpoHtml: '<p>x</p>' })).status).toBe(403);
  });
});
