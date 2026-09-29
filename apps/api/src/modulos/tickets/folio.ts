// Folio [DEPTO]-[AÑO]-[CONSECUTIVO], sin duplicados aunque dos personas creen tickets al mismo tiempo.
// Un registro por departamento + año en `folio_contadores`. "Crear si no existe e incrementar en 1" se hace
// en UNA sola sentencia atómica (INSERT … ON DUPLICATE KEY UPDATE):
//   - si no existe el registro de este año, se crea ya con 1 (equivale a crearlo en 0 e incrementarlo);
//   - si existe, se incrementa; la fila queda bloqueada hasta el COMMIT, así las creaciones simultáneas
//     del mismo departamento se forman en fila y las de otros departamentos no se estorban;
//   - LAST_INSERT_ID(expr) devuelve el valor resultante en esta misma conexión.
// No se usa INSERT IGNORE + UPDATE: con muchas creaciones simultáneas del primer ticket del año
// MySQL produce interbloqueos (candado compartido → exclusivo). Lo detectó la prueba de 50 simultáneos.
// Si la transacción se revierte, el incremento también (no quedan huecos por errores).
// El 1 de enero no hay que hacer nada: el año nuevo no tiene registro y empieza en 0001.
import { sql } from 'kysely';
import { anioEnZona, formatearFolio } from '@mesa/shared';
import { env } from '../../config/env';
import type { Tx } from '../../db/conexion';

/** Año en curso en la zona horaria del sistema (APP_TZ). */
export const anioActual = (ahora = new Date()) => anioEnZona(ahora, env.APP_TZ);

export async function siguienteConsecutivo(tx: Tx, departamento: string, anio: number): Promise<number> {
  await sql`
    INSERT INTO folio_contadores (departamento, anio, ultimo_consecutivo) VALUES (${departamento}, ${anio}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE ultimo_consecutivo = LAST_INSERT_ID(ultimo_consecutivo + 1)
  `.execute(tx);
  const r = await sql<{ n: number | string }>`SELECT LAST_INSERT_ID() AS n`.execute(tx);
  const n = Number(r.rows[0]?.n);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Consecutivo de folio inválido para ${departamento}-${anio}`);
  return n;
}

export async function siguienteFolio(tx: Tx, departamento: string, anio = anioActual()): Promise<string> {
  return formatearFolio(departamento, anio, await siguienteConsecutivo(tx, departamento, anio));
}
