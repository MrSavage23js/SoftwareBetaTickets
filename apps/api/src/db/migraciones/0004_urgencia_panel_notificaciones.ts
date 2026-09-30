// Urgencia del ticket, dashboard de administración y notificaciones dentro del sistema.
import { sql, type Kysely } from 'kysely';

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

export async function up(db: Kysely<unknown>): Promise<void> {
  // El orden del ENUM importa: ORDER BY urgencia DESC deja la crítica arriba.
  await sql.raw(`ALTER TABLE tickets
    ADD COLUMN urgencia ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA' AFTER estatus,
    ADD KEY ix_tickets_urgencia (urgencia, estatus, creado_at)`).execute(db);

  await sql.raw(`CREATE TABLE notificaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    ticket_id BIGINT UNSIGNED NOT NULL,
    tipo ENUM('nuevo_ticket','ticket_contestado') NOT NULL,
    mensaje VARCHAR(255) NOT NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY ix_notif_usuario (usuario_id, leida, creado_at),
    KEY ix_notif_limpieza (leida, creado_at),
    CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
  ) ${T}`).execute(db);

  // Permiso del dashboard para el rol de administración que ya existe (los seeds no tocan roles existentes).
  await sql`INSERT IGNORE INTO permisos (codigo, grupo, descripcion) VALUES ('panel.ver', 'Administración', 'Ver el dashboard de administración')`.execute(db);
  await sql`
    INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo = 'panel.ver' WHERE r.codigo = 'ADMIN_SOPORTE'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE rp FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE p.codigo = 'panel.ver'`.execute(db);
  await sql`DELETE FROM permisos WHERE codigo = 'panel.ver'`.execute(db);
  await sql`DROP TABLE notificaciones`.execute(db);
  await sql`ALTER TABLE tickets DROP KEY ix_tickets_urgencia, DROP COLUMN urgencia`.execute(db);
}
