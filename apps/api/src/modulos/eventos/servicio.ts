// Historial genérico (DECISIONES D21). Es el punto de enganche para reportes y notificaciones futuras:
// todo lo importante que le pasa a un ticket o a la configuración queda registrado aquí.
import type { Ejecutor } from '../../db/conexion';
import { logger } from '../../lib/logger';

export const TIPOS_EVENTO = {
  CREADO: 'CREADO',
  TOMADO: 'TOMADO',
  PAUSADO: 'PAUSADO',
  REANUDADO: 'REANUDADO',
  REASIGNADO: 'REASIGNADO',
  RESPONDIDO: 'RESPONDIDO',
  COMENTADO: 'COMENTADO',
  ADJUNTO_AGREGADO: 'ADJUNTO_AGREGADO',
  CERRADO: 'CERRADO',
  NO_PROCEDE: 'NO_PROCEDE',
  REABIERTO: 'REABIERTO',
  CORREO_ENCOLADO: 'CORREO_ENCOLADO',
  CORREO_FALLIDO: 'CORREO_FALLIDO',
} as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[keyof typeof TIPOS_EVENTO];

export async function registrarEvento(
  ex: Ejecutor,
  e: {
    ticketId: number;
    actorId: number | null;
    tipo: TipoEvento;
    estatusAntes?: string | null;
    estatusDespues?: string | null;
    datos?: Record<string, unknown> | null;
  },
): Promise<void> {
  await ex
    .insertInto('ticket_eventos')
    .values({
      ticket_id: e.ticketId,
      actor_id: e.actorId,
      tipo: e.tipo,
      estatus_antes: e.estatusAntes ?? null,
      estatus_despues: e.estatusDespues ?? null,
      datos: e.datos ? JSON.stringify(e.datos) : null,
    })
    .execute();
}

/** Auditoría de acciones administrativas (usuarios, catálogos, plantillas, ajustes, sesiones). */
export async function auditar(
  ex: Ejecutor,
  a: { actorId: number | null; entidad: string; entidadId: string | number; accion: string; datos?: Record<string, unknown>; ip?: string | null },
): Promise<void> {
  try {
    await ex
      .insertInto('auditoria')
      .values({
        actor_id: a.actorId,
        entidad: a.entidad,
        entidad_id: String(a.entidadId),
        accion: a.accion,
        datos: a.datos ? JSON.stringify(a.datos) : null,
        ip: a.ip ?? null,
      })
      .execute();
  } catch (e) {
    // Dentro de una transacción el error se propaga; fuera de ella, la auditoría nunca tumba la operación.
    logger.error({ err: e, entidad: a.entidad, accion: a.accion }, 'No se pudo registrar la auditoría');
    if ('isTransaction' in ex && ex.isTransaction) throw e;
  }
}
