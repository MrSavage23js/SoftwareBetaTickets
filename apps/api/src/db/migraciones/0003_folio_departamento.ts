// Nuevo formato de folio: [DEPTO]-[AÑO]-[CONSECUTIVO] (SIS-2026-0001).
// - Catálogo de departamentos (configurable desde la interfaz).
// - Contador por departamento + año: el consecutivo se reinicia en 0001 cada 1 de enero.
// - El ticket guarda su departamento; el usuario puede tener uno (se propone al crear tickets).
// - Los tickets existentes conservan su folio y quedan en el departamento SIS.
// - El folio va al inicio del asunto de los correos, entre corchetes, para buscarlo fácil en Outlook.
import { sql, type Kysely } from 'kysely';

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

const ASUNTOS: [codigo: string, anterior: string, nuevo: string][] = [
  ['TICKET_CREADO', 'Ticket {{folio}} creado · {{tipo}}', '[{{folio}}] Ticket creado · {{tipo}}'],
  ['TICKET_CERRADO', 'Ticket {{folio}} cerrado', '[{{folio}}] Ticket cerrado'],
  ['TICKET_RESPUESTA', 'Respuesta en tu ticket {{folio}}', '[{{folio}}] Respuesta de soporte'],
  ['TICKET_NUEVO_SOPORTE', 'Nuevo ticket {{folio}} · {{empresa}} · {{tipo}}', '[{{folio}}] Nuevo ticket · {{empresa}} · {{tipo}}'],
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`CREATE TABLE departamentos (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    codigo VARCHAR(6) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    actualizado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_departamentos_nombre (nombre),
    UNIQUE KEY uq_departamentos_codigo (codigo)
  ) ${T}`).execute(db);

  await sql.raw(`CREATE TABLE folio_contadores (
    departamento VARCHAR(6) NOT NULL,
    anio SMALLINT UNSIGNED NOT NULL,
    ultimo_consecutivo INT UNSIGNED NOT NULL DEFAULT 0,
    actualizado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (departamento, anio)
  ) ${T}`).execute(db);

  // Departamento por omisión para los tickets que ya existían.
  await sql`INSERT IGNORE INTO departamentos (nombre, codigo, orden) VALUES ('Sistemas / TI', 'SIS', 1)`.execute(db);

  await sql`ALTER TABLE tickets ADD COLUMN departamento_id SMALLINT UNSIGNED NULL AFTER folio`.execute(db);
  await sql`UPDATE tickets SET departamento_id = (SELECT id FROM departamentos WHERE codigo = 'SIS')`.execute(db);
  await sql.raw(`ALTER TABLE tickets
    MODIFY departamento_id SMALLINT UNSIGNED NOT NULL,
    ADD KEY ix_tickets_departamento (departamento_id, creado_at),
    ADD CONSTRAINT fk_tickets_departamento FOREIGN KEY (departamento_id) REFERENCES departamentos (id)`).execute(db);

  await sql.raw(`ALTER TABLE usuarios
    ADD COLUMN departamento_id SMALLINT UNSIGNED NULL AFTER rol_id,
    ADD CONSTRAINT fk_usuarios_departamento FOREIGN KEY (departamento_id) REFERENCES departamentos (id)`).execute(db);

  // El contador anterior (por empresa + tipo) ya no se usa.
  await sql`DROP TABLE IF EXISTS folio_consecutivos`.execute(db);

  // Asuntos con el folio al inicio, solo si el admin no los había personalizado.
  for (const [codigo, anterior, nuevo] of ASUNTOS) {
    await sql`UPDATE plantillas_correo SET asunto = ${nuevo} WHERE codigo = ${codigo} AND asunto = ${anterior}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const [codigo, anterior, nuevo] of ASUNTOS) {
    await sql`UPDATE plantillas_correo SET asunto = ${anterior} WHERE codigo = ${codigo} AND asunto = ${nuevo}`.execute(db);
  }
  await sql.raw(`CREATE TABLE IF NOT EXISTS folio_consecutivos (
    prefijo VARCHAR(10) NOT NULL PRIMARY KEY,
    ultimo INT UNSIGNED NOT NULL,
    actualizado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ${T}`).execute(db);
  await sql`ALTER TABLE usuarios DROP FOREIGN KEY fk_usuarios_departamento, DROP COLUMN departamento_id`.execute(db);
  await sql`ALTER TABLE tickets DROP FOREIGN KEY fk_tickets_departamento, DROP KEY ix_tickets_departamento, DROP COLUMN departamento_id`.execute(db);
  await sql`DROP TABLE folio_contadores`.execute(db);
  await sql`DROP TABLE departamentos`.execute(db);
}
