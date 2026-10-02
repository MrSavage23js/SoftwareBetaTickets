import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { db } from './conexion';
import { logger } from '../lib/logger';
import * as m0001 from './migraciones/0001_base';

// Lista explícita (no se lee la carpeta) para que funcione igual empaquetado en dist/.
// Para agregar una migración: crea 0002_algo.ts e impórtala aquí. (Las de MySQL, 0001–0007, quedaron
// reunidas en 0001_base al pasar a PostgreSQL; siguen en el historial de git.)
const MIGRACIONES: Record<string, Migration> = {
  '0001_base': m0001,
};

const proveedor: MigrationProvider = { getMigrations: async () => MIGRACIONES };

export const migrador = new Migrator({
  db,
  provider: proveedor,
  migrationTableName: 'kysely_migraciones',
  migrationLockTableName: 'kysely_migraciones_lock',
});

export async function migrarAlUltimo(): Promise<void> {
  const { error, results } = await migrador.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Success') logger.info(`Migración aplicada: ${r.migrationName}`);
    else if (r.status === 'Error') logger.error(`Falló la migración: ${r.migrationName}`);
  }
  if (error) throw error;
}
