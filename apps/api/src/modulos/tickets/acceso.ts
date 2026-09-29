// Quién puede ver qué ticket. Es la regla central de "un usuario nunca ve tickets ajenos":
// la usan el detalle, la lista, los comentarios y la descarga de adjuntos.
import { PERMISOS } from '@mesa/shared';
import type { ExpressionBuilder } from 'kysely';
import { db } from '../../db/conexion';
import type { BD } from '../../db/tipos';
import type { UsuarioActual } from '../auth/contexto';

export function puedeVerTicket(
  u: UsuarioActual,
  t: { solicitante_id: number; empresa_id: number },
  empresasUsuario?: ReadonlySet<number>,
): boolean {
  if (u.permisos.has(PERMISOS.TICKETS_VER_TODOS)) return true;
  if (t.solicitante_id === u.id && u.permisos.has(PERMISOS.TICKETS_VER_PROPIOS)) return true;
  if (u.permisos.has(PERMISOS.TICKETS_VER_EMPRESA) && empresasUsuario?.has(t.empresa_id)) return true;
  return false;
}

export async function empresasDe(usuarioId: number): Promise<Set<number>> {
  const filas = await db.selectFrom('usuario_empresas').select('empresa_id').where('usuario_id', '=', usuarioId).execute();
  return new Set(filas.map((f) => f.empresa_id));
}

/** Filtro SQL equivalente a `puedeVerTicket` para listas (tabla con alias "t"). */
export function filtroVisibles(u: UsuarioActual) {
  return (eb: ExpressionBuilder<BD & { t: BD['tickets'] }, 't'>) => {
    if (u.permisos.has(PERMISOS.TICKETS_VER_TODOS)) return eb.val(true);
    const condiciones = [];
    if (u.permisos.has(PERMISOS.TICKETS_VER_PROPIOS)) condiciones.push(eb('t.solicitante_id', '=', u.id));
    if (u.permisos.has(PERMISOS.TICKETS_VER_EMPRESA)) {
      condiciones.push(
        eb('t.empresa_id', 'in', eb.selectFrom('usuario_empresas').select('empresa_id').where('usuario_id', '=', u.id)),
      );
    }
    return condiciones.length ? eb.or(condiciones) : eb.val(false);
  };
}
