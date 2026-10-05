// Folio [DEPTO]-[CONSECUTIVO] (VEN-0001), sin duplicados aunque dos personas creen tickets al mismo tiempo.
// Un consecutivo por departamento que NUNCA se reinicia (no lleva año: el año se ve en la fecha del ticket).
// Se guarda en `folio_contadores` con anio = CONTADOR_CONTINUO (0). Las filas con un año real son de los
// folios anteriores DEPTO-AAAA-NNNN (hasta octubre de 2026); se conservan para reportes y no se tocan.
// "Crear si no existe e incrementar en 1" se hace en UNA sola sentencia atómica
// (INSERT … ON CONFLICT DO UPDATE … RETURNING):
//   - si no existe el registro del departamento, se crea ya con 1;
//   - si existe, se incrementa; la fila queda bloqueada hasta el COMMIT, así las creaciones simultáneas
//     del mismo departamento se forman en fila y las de otros departamentos no se estorban;
//   - RETURNING devuelve el valor resultante en la misma sentencia.
// No se usa "insertar si falta" + UPDATE por separado: con muchas creaciones simultáneas del primer ticket
// produce interbloqueos. Lo detecta la prueba de 50 simultáneos.
// Si la transacción se revierte, el incremento también (no quedan huecos por errores).
import { sql } from 'kysely';
import { anioEnZona, formatearFolio } from '@mesa/shared';
import { env } from '../../config/env';
import type { Tx } from '../../db/conexion';

/** Valor de `anio` de la fila del contador continuo (sin año). */
export const CONTADOR_CONTINUO = 0;

/** Año en curso en la zona horaria del sistema (APP_TZ). */
export const anioActual = (ahora = new Date()) => anioEnZona(ahora, env.APP_TZ);

export async function siguienteConsecutivo(tx: Tx, departamento: string): Promise<number> {
  const r = await sql<{ n: number }>`
    INSERT INTO folio_contadores (departamento, anio, ultimo_consecutivo) VALUES (${departamento}, ${CONTADOR_CONTINUO}, 1)
    ON CONFLICT (departamento, anio) DO UPDATE SET ultimo_consecutivo = folio_contadores.ultimo_consecutivo + 1
    RETURNING ultimo_consecutivo AS n
  `.execute(tx);
  const n = Number(r.rows[0]?.n);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Consecutivo de folio inválido para ${departamento}`);
  return n;
}

export async function siguienteFolio(tx: Tx, departamento: string): Promise<string> {
  return formatearFolio(departamento, await siguienteConsecutivo(tx, departamento));
}
