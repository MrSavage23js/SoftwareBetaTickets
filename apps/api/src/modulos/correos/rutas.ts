import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { PERMISOS, esquemaPlantilla, type CorreoFila, type PlantillaFila } from '@mesa/shared';
import { env } from '../../config/env';
import { db } from '../../db/conexion';
import { errores } from '../../lib/errores';
import { sanitizarPlantillaCorreo } from '../../lib/sanitizar';
import { idDeRuta, validar } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor, ipDe } from '../auth/contexto';
import { auditar } from '../eventos/servicio';
import { renderizarHtml, renderizarTexto, VARIABLES_EJEMPLO } from './plantillas';

export const rutasCorreos = Router();

const permisoCola = requierePermiso(PERMISOS.CORREOS_COLA);
const permisoPlantillas = requierePermiso(PERMISOS.CORREOS_PLANTILLAS);

// ---------------------------------------------------------------- Cola
const esquemaCola = z.object({
  estado: z.enum(['PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO', 'CANCELADO']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

rutasCorreos.get('/', permisoCola, async (req, res) => {
  const f = validar(esquemaCola, req.query);
  let q = db.selectFrom('correos_salida as c').leftJoin('tickets as t', 't.id', 'c.ticket_id');
  if (f.estado) q = q.where('c.estado', '=', f.estado);
  const [filas, total, resumen] = await Promise.all([
    q
      .select([
        'c.id',
        'c.plantilla_codigo',
        't.folio',
        'c.para',
        'c.asunto',
        'c.estado',
        'c.intentos',
        'c.proximo_intento_at',
        'c.ultimo_error',
        'c.creado_at',
        'c.enviado_at',
      ])
      .orderBy('c.id', 'desc')
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina)
      .execute(),
    q.select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow(),
    db.selectFrom('correos_salida').select(['estado', sql<number>`COUNT(*)`.as('n')]).groupBy('estado').execute(),
  ]);
  const datos: CorreoFila[] = filas.map((c) => ({
    id: c.id,
    plantillaCodigo: c.plantilla_codigo,
    ticketFolio: c.folio,
    para: c.para,
    asunto: c.asunto,
    estado: c.estado,
    intentos: c.intentos,
    proximoIntentoAt: c.estado === 'PENDIENTE' ? c.proximo_intento_at.toISOString() : null,
    ultimoError: c.ultimo_error,
    creadoAt: c.creado_at.toISOString(),
    enviadoAt: c.enviado_at?.toISOString() ?? null,
  }));
  res.json({
    datos,
    total: Number(total.n),
    pagina: f.pagina,
    porPagina: f.porPagina,
    transporte: env.MAIL_TRANSPORT,
    resumen: Object.fromEntries(resumen.map((r) => [r.estado, Number(r.n)])),
  });
});

rutasCorreos.post('/:id/reintentar', permisoCola, async (req, res) => {
  const id = idDeRuta(req.params.id);
  const r = await db
    .updateTable('correos_salida')
    .set({ estado: 'PENDIENTE', intentos: 0, proximo_intento_at: new Date(), ultimo_error: null, bloqueado_hasta: null })
    .where('id', '=', id)
    .where('estado', 'in', ['FALLIDO', 'CANCELADO'])
    .executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw errores.conflicto('Solo se pueden reintentar correos fallidos o cancelados.');
  await auditar(db, { actorId: actor(req).id, entidad: 'correo', entidadId: id, accion: 'REINTENTO_MANUAL', ip: ipDe(req) });
  res.status(204).end();
});

// ---------------------------------------------------------------- Plantillas
function aFila(p: {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  asunto: string;
  cuerpo_html: string;
  variables: { nombre: string; descripcion: string }[];
  activa: number;
  actualizado_at: Date;
}): PlantillaFila {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    asunto: p.asunto,
    cuerpoHtml: p.cuerpo_html,
    variables: p.variables,
    activa: !!p.activa,
    actualizadoAt: p.actualizado_at.toISOString(),
  };
}

rutasCorreos.get('/plantillas', permisoPlantillas, async (_req, res) => {
  const filas = await db.selectFrom('plantillas_correo').selectAll().orderBy('id').execute();
  res.json(filas.map(aFila));
});

rutasCorreos.put('/plantillas/:id', permisoPlantillas, async (req, res) => {
  const id = idDeRuta(req.params.id);
  const d = validar(esquemaPlantilla, req.body);
  const antes = await db.selectFrom('plantillas_correo').selectAll().where('id', '=', id).executeTakeFirst();
  if (!antes) throw errores.noEncontrado('La plantilla no existe.');
  // Los correos de tickets deben llevar el folio en el asunto para buscarlos en Outlook.
  if (antes.codigo.startsWith('TICKET_') && !/{{s*folios*}}/.test(d.asunto)) {
    throw errores.validacion('El asunto debe incluir {{folio}} para poder identificar el ticket en Outlook.', {
      asunto: 'El asunto debe incluir {{folio}}.',
    });
  }
  const cuerpo = sanitizarPlantillaCorreo(d.cuerpoHtml);
  await db
    .updateTable('plantillas_correo')
    .set({ asunto: d.asunto, cuerpo_html: cuerpo, activa: d.activa ? 1 : 0, actualizado_por_id: actor(req).id })
    .where('id', '=', id)
    .execute();
  await auditar(db, {
    actorId: actor(req).id,
    entidad: 'plantilla',
    entidadId: id,
    accion: 'EDITADA',
    ip: ipDe(req),
    datos: { codigo: antes.codigo, asuntoAntes: antes.asunto, asuntoDespues: d.asunto, activa: d.activa },
  });
  const nueva = await db.selectFrom('plantillas_correo').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  res.json(aFila(nueva));
});

rutasCorreos.post('/plantillas/vista-previa', permisoPlantillas, async (req, res) => {
  const d = validar(esquemaPlantilla, req.body);
  res.json({
    asunto: renderizarTexto(d.asunto, VARIABLES_EJEMPLO),
    html: renderizarHtml(sanitizarPlantillaCorreo(d.cuerpoHtml), VARIABLES_EJEMPLO),
  });
});
