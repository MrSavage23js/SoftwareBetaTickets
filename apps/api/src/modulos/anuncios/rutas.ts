// Anuncios: banner que los admins mandan a todos o a ciertos departamentos. Se ve en cuanto se manda
// y hasta que un admin lo retira (no hay programación por fechas). Cada usuario puede cerrar los que no
// son urgentes; los urgentes se quedan hasta que se retiran.
//   GET  /anuncios/mios          → los que le tocan al usuario y no ha cerrado (lo consulta el banner).
//   POST /anuncios/:id/cerrar    → el usuario lo cierra.
//   Administración (ajustes.administrar): listar, mandar, retirar y borrar.
import { Router } from 'express';
import { sql } from 'kysely';
import { esquemaAnuncio, PERMISOS, type Anuncio, type AnuncioAdmin } from '@mesa/shared';
import { db } from '../../db/conexion';
import { errores } from '../../lib/errores';
import { idDeRuta, validar } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor, ipDe } from '../auth/contexto';
import { auditar } from '../eventos/servicio';

export const rutasAnuncios = Router();

const ORDEN_TIPO = sql<number>`CASE a.tipo WHEN 'URGENTE' THEN 0 WHEN 'ADVERTENCIA' THEN 1 ELSE 2 END`;

rutasAnuncios.get('/mios', async (req, res) => {
  const u = actor(req);
  const filas = await db
    .selectFrom('anuncios as a')
    .select(['a.id', 'a.titulo', 'a.mensaje', 'a.tipo', 'a.creado_at'])
    .where('a.activo', '=', 1)
    // Para todos, o para el departamento del usuario.
    .where((eb) =>
      eb.or([
        eb.not(eb.exists(eb.selectFrom('anuncio_departamentos as ad').select('ad.anuncio_id').whereRef('ad.anuncio_id', '=', 'a.id'))),
        eb.exists(
          eb
            .selectFrom('anuncio_departamentos as ad')
            .innerJoin('usuarios as us', 'us.departamento_id', 'ad.departamento_id')
            .select('ad.anuncio_id')
            .whereRef('ad.anuncio_id', '=', 'a.id')
            .where('us.id', '=', u.id),
        ),
      ]),
    )
    // Los urgentes se ven aunque se hayan cerrado (p. ej. si antes era informativo).
    .where((eb) =>
      eb.or([
        eb('a.tipo', '=', 'URGENTE'),
        eb.not(
          eb.exists(
            eb.selectFrom('anuncio_cerrados as c').select('c.anuncio_id').whereRef('c.anuncio_id', '=', 'a.id').where('c.usuario_id', '=', u.id),
          ),
        ),
      ]),
    )
    .orderBy(ORDEN_TIPO)
    .orderBy('a.creado_at', 'desc')
    .execute();
  const datos: Anuncio[] = filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    mensaje: f.mensaje,
    tipo: f.tipo,
    cerrable: f.tipo !== 'URGENTE',
    creadoAt: f.creado_at.toISOString(),
  }));
  res.json(datos);
});

rutasAnuncios.post('/:id/cerrar', async (req, res) => {
  const u = actor(req);
  const id = idDeRuta(req.params.id);
  const a = await db.selectFrom('anuncios').select('tipo').where('id', '=', id).executeTakeFirst();
  if (!a) throw errores.noEncontrado('El anuncio no existe.');
  if (a.tipo === 'URGENTE') throw errores.conflicto('Los anuncios urgentes no se pueden cerrar.');
  await db
    .insertInto('anuncio_cerrados')
    .values({ anuncio_id: id, usuario_id: u.id })
    .onConflict((oc) => oc.doNothing())
    .execute();
  res.status(204).end();
});

// ---------------------------------------------------------------- Administración
const admin = requierePermiso(PERMISOS.AJUSTES_ADMINISTRAR);

async function listaAdmin(): Promise<AnuncioAdmin[]> {
  const filas = await db
    .selectFrom('anuncios as a')
    .leftJoin('usuarios as u', 'u.id', 'a.creado_por_id')
    .select((eb) => [
      'a.id',
      'a.titulo',
      'a.mensaje',
      'a.tipo',
      'a.activo',
      'a.creado_at',
      'a.retirado_at',
      eb.fn.coalesce('u.nombre', 'u.username').as('autor'),
      eb.selectFrom('anuncio_cerrados as c').select((e) => e.fn.countAll<string>().as('n')).whereRef('c.anuncio_id', '=', 'a.id').as('cerrados'),
    ])
    .orderBy('a.activo', 'desc')
    .orderBy('a.creado_at', 'desc')
    .limit(100)
    .execute();
  const ids = filas.map((f) => f.id);
  const deps = ids.length
    ? await db
        .selectFrom('anuncio_departamentos as ad')
        .innerJoin('departamentos as d', 'd.id', 'ad.departamento_id')
        .select(['ad.anuncio_id', 'd.id', 'd.nombre'])
        .where('ad.anuncio_id', 'in', ids)
        .orderBy('d.orden')
        .orderBy('d.nombre')
        .execute()
    : [];
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    mensaje: f.mensaje,
    tipo: f.tipo,
    cerrable: f.tipo !== 'URGENTE',
    creadoAt: f.creado_at.toISOString(),
    activo: !!f.activo,
    departamentos: deps.filter((d) => d.anuncio_id === f.id).map((d) => ({ id: d.id, nombre: d.nombre })),
    autor: f.autor,
    cerrados: Number(f.cerrados ?? 0),
    retiradoAt: f.retirado_at ? f.retirado_at.toISOString() : null,
  }));
}

rutasAnuncios.get('/', admin, async (_req, res) => {
  res.json(await listaAdmin());
});

/** Mandar un anuncio: se ve de inmediato. */
rutasAnuncios.post('/', admin, async (req, res) => {
  const u = actor(req);
  const d = validar(esquemaAnuncio, req.body);
  const departamentoIds = [...new Set(d.departamentoIds)];
  if (departamentoIds.length) {
    // departamentos.id es SMALLINT: un id fuera de rango tampoco existe.
    const validos = departamentoIds.filter((id) => id <= 32767);
    const existentes = validos.length ? await db.selectFrom('departamentos').select('id').where('id', 'in', validos).execute() : [];
    if (existentes.length !== departamentoIds.length) {
      throw errores.validacion('Alguno de los departamentos ya no existe.', { departamentoIds: 'Alguno de los departamentos ya no existe.' });
    }
  }
  await db.transaction().execute(async (tx) => {
    const { id } = await tx
      .insertInto('anuncios')
      .values({ titulo: d.titulo, mensaje: d.mensaje, tipo: d.tipo, creado_por_id: u.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (departamentoIds.length) {
      await tx
        .insertInto('anuncio_departamentos')
        .values(departamentoIds.map((departamento_id) => ({ anuncio_id: id, departamento_id })))
        .execute();
    }
    await auditar(tx, { actorId: u.id, entidad: 'anuncio', entidadId: id, accion: 'mandar', datos: { titulo: d.titulo, tipo: d.tipo, departamentoIds }, ip: ipDe(req) });
  });
  res.status(201).json(await listaAdmin());
});

/** Retirar: deja de verse para todos, pero queda en el historial. */
rutasAnuncios.post('/:id/retirar', admin, async (req, res) => {
  const u = actor(req);
  const id = idDeRuta(req.params.id);
  const r = await db
    .updateTable('anuncios')
    .set({ activo: 0, retirado_at: new Date() })
    .where('id', '=', id)
    .where('activo', '=', 1)
    .executeTakeFirst();
  if (!r.numUpdatedRows) {
    const existe = await db.selectFrom('anuncios').select('id').where('id', '=', id).executeTakeFirst();
    if (!existe) throw errores.noEncontrado('El anuncio no existe.');
  } else {
    await auditar(db, { actorId: u.id, entidad: 'anuncio', entidadId: id, accion: 'retirar', ip: ipDe(req) });
  }
  res.json(await listaAdmin());
});

rutasAnuncios.delete('/:id', admin, async (req, res) => {
  const u = actor(req);
  const id = idDeRuta(req.params.id);
  const r = await db.deleteFrom('anuncios').where('id', '=', id).executeTakeFirst();
  if (!r.numDeletedRows) throw errores.noEncontrado('El anuncio no existe.');
  await auditar(db, { actorId: u.id, entidad: 'anuncio', entidadId: id, accion: 'borrar', ip: ipDe(req) });
  res.json(await listaAdmin());
});
