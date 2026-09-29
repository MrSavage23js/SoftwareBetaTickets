// Trabajador de la cola de correo. Toma lotes con FOR UPDATE SKIP LOCKED (si algún día hay
// dos procesos, no se envía dos veces el mismo correo) y reintenta con espera progresiva.
import { sql } from 'kysely';
import { db } from '../../db/conexion';
import { logger } from '../../lib/logger';
import { registrarEvento, TIPOS_EVENTO } from '../eventos/servicio';
import { transporte } from './transportes';

/** Minutos de espera antes de cada reintento: 1 min, 5 min, 15 min, 1 h, 6 h, 24 h. */
export const ESPERAS_MIN = [1, 5, 15, 60, 360, 1440];
export const esperaTrasIntento = (intentos: number) => ESPERAS_MIN[Math.min(intentos - 1, ESPERAS_MIN.length - 1)] ?? 1440;

const LOTE = 10;
const BLOQUEO_MIN = 5;

async function tomarLote(): Promise<number[]> {
  return db.transaction().execute(async (tx) => {
    const filas = await tx
      .selectFrom('correos_salida')
      .select('id')
      .where((eb) =>
        eb.or([
          eb.and([eb('estado', '=', 'PENDIENTE'), eb('proximo_intento_at', '<=', sql<Date>`NOW(3)`)]),
          // Un correo "ENVIANDO" con el bloqueo vencido quedó atorado (el proceso se cayó a medio envío).
          eb.and([eb('estado', '=', 'ENVIANDO'), eb('bloqueado_hasta', '<', sql<Date>`NOW(3)`)]),
        ]),
      )
      .orderBy('id')
      .limit(LOTE)
      .forUpdate()
      .skipLocked()
      .execute();
    const ids = filas.map((f) => f.id);
    if (ids.length) {
      await tx
        .updateTable('correos_salida')
        .set({ estado: 'ENVIANDO', bloqueado_hasta: sql<Date>`NOW(3) + INTERVAL ${BLOQUEO_MIN} MINUTE` })
        .where('id', 'in', ids)
        .execute();
    }
    return ids;
  });
}

async function enviarUno(id: number): Promise<void> {
  const c = await db.selectFrom('correos_salida').selectAll().where('id', '=', id).executeTakeFirst();
  if (!c) return;
  const t = transporte();
  try {
    const r = await t.enviar({ id: c.id, para: c.para, cc: c.cc ?? [], asunto: c.asunto, html: c.cuerpo_html, texto: c.cuerpo_texto });
    await db
      .updateTable('correos_salida')
      .set({
        estado: 'ENVIADO',
        enviado_at: new Date(),
        intentos: c.intentos + 1,
        bloqueado_hasta: null,
        ultimo_error: null,
        transporte: t.nombre,
        id_mensaje_proveedor: r.idMensaje?.slice(0, 255) ?? null,
      })
      .where('id', '=', id)
      .execute();
    logger.info({ correo: id, transporte: t.nombre }, 'Correo enviado');
  } catch (e) {
    const intentos = c.intentos + 1;
    const agotado = intentos >= c.max_intentos;
    // Solo el mensaje del error, recortado: nunca credenciales ni el cuerpo del correo.
    const mensaje = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 1000);
    await db
      .updateTable('correos_salida')
      .set({
        estado: agotado ? 'FALLIDO' : 'PENDIENTE',
        intentos,
        bloqueado_hasta: null,
        ultimo_error: mensaje,
        transporte: t.nombre,
        proximo_intento_at: sql<Date>`NOW(3) + INTERVAL ${esperaTrasIntento(intentos)} MINUTE`,
      })
      .where('id', '=', id)
      .execute();
    logger.warn({ correo: id, intentos, agotado, error: mensaje }, agotado ? 'Correo FALLIDO (sin más reintentos)' : 'Falló el envío; se reintentará');
    if (agotado && c.ticket_id) {
      await registrarEvento(db, {
        ticketId: c.ticket_id,
        actorId: null,
        tipo: TIPOS_EVENTO.CORREO_FALLIDO,
        datos: { correoId: id, asunto: c.asunto, error: mensaje.slice(0, 200) },
      }).catch(() => undefined);
    }
  }
}

/** Procesa un lote. Devuelve cuántos correos intentó enviar. */
export async function procesarCola(): Promise<number> {
  const ids = await tomarLote();
  for (const id of ids) await enviarUno(id);
  return ids.length;
}
