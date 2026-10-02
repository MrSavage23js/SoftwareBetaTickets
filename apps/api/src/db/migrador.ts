import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { db } from './conexion';
import { logger } from '../lib/logger';
import * as m0001 from './migraciones/0001_base';
import * as m0002 from './migraciones/0002_cambio_password';
import * as m0003 from './migraciones/0003_folio_departamento';
import * as m0004 from './migraciones/0004_urgencia_panel_notificaciones';
import * as m0005 from './migraciones/0005_estatus_no_procede';
import * as m0006 from './migraciones/0006_nombre_sistema_de_tickets';

// Lista explícita (no se lee la carpeta) para que funcione igual empaquetado en dist/.
// Para agregar una migración: crea 0002_algo.ts e impórtala aquí.
const MIGRACIONES: Record<string, Migration> = {
  '0001_base': m0001,
  '0002_cambio_password': m0002,
  '0003_folio_departamento': m0003,
  '0004_urgencia_panel_notificaciones': m0004,
  '0005_estatus_no_procede': m0005,
  '0006_nombre_sistema_de_tickets': m0006,
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
