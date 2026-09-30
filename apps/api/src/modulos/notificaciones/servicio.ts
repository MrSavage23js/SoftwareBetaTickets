// Notificaciones dentro del sistema (campana). Se insertan DENTRO de la transacción de la operación
// que las provoca: si la operación falla, no queda una notificación suelta.
//   - Ticket nuevo            → a cada admin que atiende tickets (menos a quien lo creó).
//   - Ticket contestado/actualizado (respuesta, tomado, pausado, reanudado, reasignado, cerrado)
//                             → al solicitante (menos si él mismo hizo el cambio).
import { sql } from 'kysely';
import { PERMISOS, type ListaNotificaciones, type TipoNotificacion } from '@mesa/shared';
import { db, type Ejecutor } from '../../db/conexion';
import { errores } from '../../lib/errores';

const MAX_MENSAJE = 255;
const RECIENTES = 20;

async function insertar(ex: Ejecutor, usuarios: number[], ticketId: number, tipo: TipoNotificacion, mensaje: string) {
  const unicos = [...new Set(usuarios)];
  if (!unicos.length) return;
  await ex
    .insertInto('notificaciones')
    .values(unicos.map((usuario_id) => ({ usuario_id, ticket_id: ticketId, tipo, mensaje: mensaje.slice(0, MAX_MENSAJE) })))
    .execute();
}

/** Ticket nuevo → cada admin activo que atiende tickets. */
export async function notificarNuevoTicket(ex: Ejecutor, t: { id: number; folio: string; creadoPorId: number; urgencia: string; tipo: string }) {
  const admins = await ex
    .selectFrom('usuarios as u')
    .innerJoin('rol_permisos as rp', 'rp.rol_id', 'u.rol_id')
    .innerJoin('permisos as p', 'p.id', 'rp.permiso_id')
    .select('u.id')
    .where('p.codigo', '=', PERMISOS.TICKETS_ATENDER)
    .where('u.activo', '=', 1)
    .where('u.eliminado_at', 'is', null)
    .where('u.id', '!=', t.creadoPorId)
    .execute();
  const urgente = t.urgencia === 'CRITICA' ? ' · URGENCIA CRÍTICA' : t.urgencia === 'ALTA' ? ' · urgencia alta' : '';
  await insertar(ex, admins.map((a) => a.id), t.id, 'nuevo_ticket', `Nuevo ticket ${t.folio} · ${t.tipo}${urgente}`);
}

/** Ticket contestado o actualizado → a quien lo creó (el solicitante), si no fue él mismo quien lo cambió. */
export async function notificarSolicitante(ex: Ejecutor, t: { id: number; solicitanteId: number }, actorId: number, mensaje: string) {
  if (t.solicitanteId === actorId) return;
  const s = await ex
    .selectFrom('usuarios')
    .select('id')
    .where('id', '=', t.solicitanteId)
    .where('activo', '=', 1)
    .where('eliminado_at', 'is', null)
    .executeTakeFirst();
  if (s) await insertar(ex, [s.id], t.id, 'ticket_contestado', mensaje);
}

/** Las más recientes (leídas y no leídas) y el número de no leídas del usuario. */
export async function listarNotificaciones(usuarioId: number, soloNoLeidas = false): Promise<ListaNotificaciones> {
  let q = db
    .selectFrom('notificaciones as n')
    .innerJoin('tickets as t', 't.id', 'n.ticket_id')
    .select(['n.id', 'n.tipo', 'n.mensaje', 'n.leida', 'n.creado_at', 't.id as ticket_id', 't.folio'])
    .where('n.usuario_id', '=', usuarioId)
    .orderBy('n.creado_at', 'desc')
    .orderBy('n.id', 'desc')
    .limit(RECIENTES);
  if (soloNoLeidas) q = q.where('n.leida', '=', 0);
  const [filas, cuenta] = await Promise.all([
    q.execute(),
    db
      .selectFrom('notificaciones')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('usuario_id', '=', usuarioId)
      .where('leida', '=', 0)
      .executeTakeFirstOrThrow(),
  ]);
  return {
    noLeidas: Number(cuenta.n),
    datos: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      mensaje: f.mensaje,
      leida: !!f.leida,
      ticket: { id: f.ticket_id, folio: f.folio },
      creadoAt: f.creado_at.toISOString(),
    })),
  };
}

/** Solo el dueño puede marcar su notificación (una ajena responde 404). */
export async function marcarLeida(usuarioId: number, id: number): Promise<void> {
  const propia = await db.selectFrom('notificaciones').select('id').where('id', '=', id).where('usuario_id', '=', usuarioId).executeTakeFirst();
  if (!propia) throw errores.noEncontrado('La notificación no existe.');
  await db.updateTable('notificaciones').set({ leida: 1 }).where('id', '=', id).execute();
}

export async function marcarTodasLeidas(usuarioId: number): Promise<number> {
  const r = await db.updateTable('notificaciones').set({ leida: 1 }).where('usuario_id', '=', usuarioId).where('leida', '=', 0).executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/** Tarea periódica: las leídas de más de 90 días ya no aportan. */
export async function limpiarNotificaciones(): Promise<number> {
  const r = await db.deleteFrom('notificaciones').where('leida', '=', 1).where('creado_at', '<', sql<Date>`NOW(3) - INTERVAL 90 DAY`).executeTakeFirst();
  return Number(r.numDeletedRows);
}
