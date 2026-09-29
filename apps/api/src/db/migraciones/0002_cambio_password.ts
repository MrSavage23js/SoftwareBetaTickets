// Cambio de contraseña obligatorio: cuando el administrador asigna o restablece una contraseña,
// el usuario debe cambiarla en su siguiente inicio de sesión (el admin nunca conoce la contraseña final).
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_cambiado_at`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios DROP COLUMN debe_cambiar_password`.execute(db);
}
