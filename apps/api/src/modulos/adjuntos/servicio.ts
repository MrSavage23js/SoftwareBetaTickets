import { sql } from 'kysely';
import type { AdjuntoInfo } from '@mesa/shared';
import { db, type Ejecutor } from '../../db/conexion';
import { logger } from '../../lib/logger';
import { rm } from 'node:fs/promises';
import type { ArchivoGuardado } from './almacenamiento';
import { rutaAbsoluta } from './almacenamiento';

export const urlAdjunto = (uuid: string) => `/api/adjuntos/${uuid}`;

export function aInfo(a: { uuid: string; nombre_original: string; mime: string; tamano_bytes: number; en_linea: number }): AdjuntoInfo {
  return {
    uuid: a.uuid,
    nombre: a.nombre_original,
    mime: a.mime,
    tamano: a.tamano_bytes,
    enLinea: !!a.en_linea,
    url: urlAdjunto(a.uuid),
  };
}

export async function insertarAdjuntos(
  ex: Ejecutor,
  archivos: ArchivoGuardado[],
  d: { ticketId: number | null; mensajeId: number | null; subidoPorId: number; enLinea: boolean },
): Promise<void> {
  if (!archivos.length) return;
  await ex
    .insertInto('adjuntos')
    .values(
      archivos.map((a) => ({
        uuid: a.uuid,
        ticket_id: d.ticketId,
        mensaje_id: d.mensajeId,
        subido_por_id: d.subidoPorId,
        nombre_original: a.nombreOriginal,
        ruta_relativa: a.rutaRelativa,
        mime: a.mime,
        tamano_bytes: a.tamano,
        sha256: a.sha256,
        en_linea: d.enLinea ? 1 : 0,
      })),
    )
    .execute();
}

/**
 * Liga al ticket/mensaje las imágenes que el usuario insertó en el editor (subidas antes como temporales).
 * Solo toma temporales del propio usuario: no se puede "robar" un adjunto ajeno poniendo su uuid.
 */
export async function vincularEnLinea(
  ex: Ejecutor,
  uuids: string[],
  d: { ticketId: number; mensajeId: number | null; usuarioId: number },
): Promise<void> {
  if (!uuids.length) return;
  await ex
    .updateTable('adjuntos')
    .set({ ticket_id: d.ticketId, mensaje_id: d.mensajeId })
    .where('uuid', 'in', uuids)
    .where('ticket_id', 'is', null)
    .where('subido_por_id', '=', d.usuarioId)
    .where('eliminado_at', 'is', null)
    .execute();
}

/** Tarea periódica: borra imágenes temporales que nunca se usaron (más de 24 h). */
export async function limpiarTemporalesHuerfanos(): Promise<number> {
  const viejos = await db
    .selectFrom('adjuntos')
    .select(['id', 'uuid', 'ruta_relativa'])
    .where('ticket_id', 'is', null)
    .where('creado_at', '<', sql<Date>`NOW(3) - INTERVAL 1 DAY`)
    .limit(500)
    .execute();
  for (const a of viejos) {
    await rm(rutaAbsoluta(a.ruta_relativa), { force: true }).catch((e: unknown) =>
      logger.warn({ err: e, uuid: a.uuid }, 'No se pudo borrar un temporal'),
    );
  }
  if (viejos.length) await db.deleteFrom('adjuntos').where('id', 'in', viejos.map((a) => a.id)).execute();
  return viejos.length;
}
