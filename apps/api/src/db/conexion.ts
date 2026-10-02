import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { BD } from './tipos';

// pg entrega BIGINT (ids, COUNT(*)) y NUMERIC (SUM, AVG) como texto para no perder precisión.
// Aquí ningún valor se acerca a 2^53, así que se convierten a número como esperaba el código.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// BOOLEAN llega como 1/0, igual que el TINYINT(1) de MySQL con el que se escribió el código (db/tipos.ts).
// Al escribir, PostgreSQL acepta 1/0 y true/false en una columna BOOLEAN.
pg.types.setTypeParser(pg.types.builtins.BOOL, (v) => (v === 't' ? 1 : 0));

let pool: pg.Pool | undefined;

function crearPool(): pg.Pool {
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    // Todo en UTC: la conversión a la zona local se hace solo al mostrar.
    options: '-c TimeZone=UTC',
  });
  // Un error en una conexión inactiva (p. ej. la BD se reinició) no debe tumbar el proceso.
  pool.on('error', (e) => logger.error({ err: e }, 'Error en una conexión inactiva de la BD'));
  return pool;
}

export const db = new Kysely<BD>({
  dialect: new PostgresDialect({ pool: async () => crearPool() }),
  log: (e) => {
    if (e.level === 'error') {
      logger.error({ err: e.error, sql: e.query.sql, ms: e.queryDurationMillis }, 'Error en consulta SQL');
    } else if (e.queryDurationMillis > 500) {
      logger.warn({ sql: e.query.sql, ms: Math.round(e.queryDurationMillis) }, 'Consulta lenta');
    }
  },
});

export type Tx = Transaction<BD>;
export type Ejecutor = Kysely<BD> | Tx;

/** Comprueba que la BD responde (para /health). */
export async function bdDisponible(timeoutMs = 3000): Promise<boolean> {
  try {
    await Promise.race([
      sql`SELECT 1`.execute(db),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function cerrarBD(): Promise<void> {
  await db.destroy();
}
