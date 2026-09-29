import { Kysely, MysqlDialect, sql, type Transaction } from 'kysely';
import { createPool, type Pool } from 'mysql2';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { BD } from './tipos';

let pool: Pool | undefined;

function crearPool(): Pool {
  pool = createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: env.DB_POOL_MAX,
    waitForConnections: true,
    queueLimit: 200,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    charset: 'utf8mb4_0900_ai_ci',
    // Todo en UTC: la conversión a la zona local se hace solo al mostrar.
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  });
  return pool;
}

export const db = new Kysely<BD>({
  dialect: new MysqlDialect({
    pool: async () => crearPool(),
    onCreateConnection: async (conexion) => {
      await conexion.executeQuery(sql`SET time_zone = '+00:00'`.compile(db));
    },
  }),
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
