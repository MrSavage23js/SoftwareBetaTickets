// Notificaciones dentro del sistema (campana). Se insertan DENTRO de la transacción de la operación
// que las provoca: si la operación falla, no queda una notificación suelta.
//   - Ticket nuevo            → a cada admin que atiende tickets (menos a quien lo creó).
//   - Ticket contestado/actualizado (respuesta, tomado, pausado, reanudado, reasignado, cerrado)
//                             → al solicitante (menos si él mismo hizo el cambio).
// No hay otros casos. Al leer, la campana también aplica las reglas: "nuevo_ticket" solo le aparece a
// quien HOY atiende tickets, y "ticket_contestado" solo si el ticket sigue siendo suyo. Así, un admin
// que también reporta tickets ve ambos tipos, y quien deja de ser admin deja de ver los "nuevo_ticket".
import { sql, type ExpressionBuilder } from 'kysely';
import { PERMISOS, type ListaNotificaciones, type TipoNotificacion } from '@mesa/shared';
import { db, type Ejecutor } from '../../db/conexion';
import type { BD } from '../../db/tipos';
import { tienePermiso, type UsuarioActual } from '../auth/contexto';
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

/** Filtro de las notificaciones del usuario que le tocan según su rol actual (ver reglas arriba). */
function visibles(u: UsuarioActual) {
  const esAdmin = tienePermiso(u, PERMISOS.TICKETS_ATENDER);
  return (eb: ExpressionBuilder<BD & { n: BD['notificaciones']; t: BD['tickets'] }, 'n' | 't'>) =>
    eb.and([
      eb('n.usuario_id', '=', u.id),
      eb.or([
        ...(esAdmin ? [eb('n.tipo', '=', 'nuevo_ticket')] : []),
        eb.and([eb('n.tipo', '=', 'ticket_contestado'), eb('t.solicitante_id', '=', u.id)]),
      ]),
    ]);
}

const deUsuario = (u: UsuarioActual) =>
  db.selectFrom('notificaciones as n').innerJoin('tickets as t', 't.id', 'n.ticket_id').where(visibles(u));

/** Las más recientes (leídas y no leídas) y el número de no leídas del usuario. */
export async function listarNotificaciones(u: UsuarioActual, soloNoLeidas = false): Promise<ListaNotificaciones> {
  let q = deUsuario(u)
    .select(['n.id', 'n.tipo', 'n.mensaje', 'n.leida', 'n.creado_at', 't.id as ticket_id', 't.folio'])
    .orderBy('n.creado_at', 'desc')
    .orderBy('n.id', 'desc')
    .limit(RECIENTES);
  if (soloNoLeidas) q = q.where('n.leida', '=', 0);
  const [filas, cuenta] = await Promise.all([
    q.execute(),
    deUsuario(u).select(sql<number>`COUNT(*)`.as('n')).where('n.leida', '=', 0).executeTakeFirstOrThrow(),
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

/** Marca las que el usuario ve en su campana (las que ocultan las reglas no cuentan). */
export async function marcarTodasLeidas(u: UsuarioActual): Promise<number> {
  const ids = (await deUsuario(u).select('n.id').where('n.leida', '=', 0).execute()).map((n) => n.id);
  if (!ids.length) return 0;
  const r = await db.updateTable('notificaciones').set({ leida: 1 }).where('id', 'in', ids).executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/** Tarea periódica: las leídas de más de 90 días ya no aportan. */
export async function limpiarNotificaciones(): Promise<number> {
  const r = await db.deleteFrom('notificaciones').where('leida', '=', 1).where('creado_at', '<', sql<Date>`NOW(3) - INTERVAL 90 DAY`).executeTakeFirst();
  return Number(r.numDeletedRows);
}
