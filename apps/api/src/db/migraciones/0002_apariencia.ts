// Apariencia elegida por cada usuario (modo claro/oscuro y paleta). NULL = la de omisión.
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios ADD COLUMN apariencia JSONB NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios DROP COLUMN apariencia`.execute(db);
}
