// Respuestas guardadas de cada técnico: las escribe una vez y las inserta con un clic al responder.
// Cada quien ve y edita solo las suyas. No llevan imágenes: una imagen es un adjunto ligado a un mensaje.
import { Router } from 'express';
import {
  esquemaRespuestaGuardada,
  MAX_RESPUESTAS_GUARDADAS,
  PERMISOS,
  type RespuestaGuardada,
} from '@mesa/shared';
import { db } from '../../db/conexion';
import { errores } from '../../lib/errores';
import { sanitizarContenido, tieneContenido } from '../../lib/sanitizar';
import { idDeRuta, validar } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor } from '../auth/contexto';

export const rutasRespuestas = Router();
rutasRespuestas.use(requierePermiso(PERMISOS.TICKETS_RESPONDER));

function limpiar(entrada: unknown) {
  const d = validar(esquemaRespuestaGuardada, entrada);
  const html = sanitizarContenido(d.cuerpoHtml).replace(/<img\b[^>]*>/gi, '');
  if (!tieneContenido(html))
    throw errores.validacion('Escribe el texto de la respuesta.', {
      cuerpoHtml: 'Escribe el texto de la respuesta.',
    });
  return { titulo: d.titulo, cuerpo_html: html };
}

async function lista(usuarioId: number): Promise<RespuestaGuardada[]> {
  const filas = await db
    .selectFrom('respuestas_guardadas')
    .select(['id', 'titulo', 'cuerpo_html'])
    .where('usuario_id', '=', usuarioId)
    .orderBy('titulo')
    .orderBy('id')
    .execute();
  return filas.map((f) => ({ id: f.id, titulo: f.titulo, cuerpoHtml: f.cuerpo_html }));
}

rutasRespuestas.get('/', async (req, res) => {
  res.json(await lista(actor(req).id));
});

rutasRespuestas.post('/', async (req, res) => {
  const u = actor(req);
  const valores = limpiar(req.body);
  const { n } = await db
    .selectFrom('respuestas_guardadas')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('usuario_id', '=', u.id)
    .executeTakeFirstOrThrow();
  if (Number(n) >= MAX_RESPUESTAS_GUARDADAS) {
    throw errores.conflicto(
      `Puedes guardar hasta ${MAX_RESPUESTAS_GUARDADAS} respuestas. Borra alguna que ya no uses.`,
    );
  }
  await db
    .insertInto('respuestas_guardadas')
    .values({ usuario_id: u.id, ...valores })
    .execute();
  res.status(201).json(await lista(u.id));
});

rutasRespuestas.put('/:id', async (req, res) => {
  const u = actor(req);
  const valores = limpiar(req.body);
  const r = await db
    .updateTable('respuestas_guardadas')
    .set({ ...valores, actualizado_at: new Date() })
    .where('id', '=', idDeRuta(req.params.id))
    .where('usuario_id', '=', u.id)
    .executeTakeFirst();
  if (!r.numUpdatedRows) throw errores.noEncontrado('La respuesta no existe.');
  res.json(await lista(u.id));
});

rutasRespuestas.delete('/:id', async (req, res) => {
  const u = actor(req);
  const r = await db
    .deleteFrom('respuestas_guardadas')
    .where('id', '=', idDeRuta(req.params.id))
    .where('usuario_id', '=', u.id)
    .executeTakeFirst();
  if (!r.numDeletedRows) throw errores.noEncontrado('La respuesta no existe.');
  res.json(await lista(u.id));
});
