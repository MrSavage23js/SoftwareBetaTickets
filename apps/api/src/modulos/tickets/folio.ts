// Consecutivo de folio sin duplicados aunque dos personas creen tickets al mismo tiempo (DECISIONES D10).
// INSERT … ON DUPLICATE KEY UPDATE bloquea la fila del prefijo hasta el COMMIT de la transacción:
// las creaciones concurrentes con el mismo prefijo se forman en fila; con prefijos distintos no se estorban.
// Si la transacción se revierte, el número también se revierte (no quedan huecos por errores).
import { sql } from 'kysely';
import { formatearFolio } from '@mesa/shared';
import type { Tx } from '../../db/conexion';

export async function siguienteConsecutivo(tx: Tx, prefijo: string): Promise<number> {
  await sql`
    INSERT INTO folio_consecutivos (prefijo, ultimo) VALUES (${prefijo}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)
  `.execute(tx);
  const r = await sql<{ n: number | string }>`SELECT LAST_INSERT_ID() AS n`.execute(tx);
  const n = Number(r.rows[0]?.n);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Consecutivo de folio inválido para ${prefijo}`);
  return n;
}

export async function siguienteFolio(tx: Tx, prefijo: string): Promise<string> {
  return formatearFolio(prefijo, await siguienteConsecutivo(tx, prefijo));
}
