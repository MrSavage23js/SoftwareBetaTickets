// Estatus final "No procede": soporte rechaza una solicitud abierta indicando el motivo.
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`INSERT IGNORE INTO estatus_ticket (codigo, nombre, clase_color, es_final, orden) VALUES ('NO_PROCEDE', 'No procede', 'nopr', 1, 5)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM estatus_ticket WHERE codigo = 'NO_PROCEDE'`.execute(db);
}
