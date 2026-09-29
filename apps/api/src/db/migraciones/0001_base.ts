// Migración base: todas las tablas del modelo (docs/MODELO_DATOS.md).
// Reglas: las migraciones solo avanzan; nunca se edita una que ya corrió en producción, se agrega otra.
import { sql, type Kysely } from 'kysely';

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';
const CREADO = 'creado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)';
const ACTUALIZADO = 'actualizado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)';

const SENTENCIAS = [
  // ------------------------------------------------------------ acceso y permisos
  `CREATE TABLE roles (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(40) NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    descripcion VARCHAR(255) NULL,
    es_sistema TINYINT(1) NOT NULL DEFAULT 0,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_roles_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE permisos (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(60) NOT NULL,
    grupo VARCHAR(40) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_permisos_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE rol_permisos (
    rol_id SMALLINT UNSIGNED NOT NULL,
    permiso_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    KEY ix_rol_permisos_permiso (permiso_id),
    CONSTRAINT fk_rp_rol FOREIGN KEY (rol_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos (id) ON DELETE CASCADE
  ) ${T}`,

  // ------------------------------------------------------------ catálogos
  `CREATE TABLE empresas (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    codigo VARCHAR(4) NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_empresas_nombre (nombre),
    UNIQUE KEY uq_empresas_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE tipos_solicitud (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    codigo VARCHAR(4) NOT NULL,
    titulo_detalle VARCHAR(80) NOT NULL,
    requiere_modulo TINYINT(1) NOT NULL DEFAULT 1,
    requiere_concepto TINYINT(1) NOT NULL DEFAULT 1,
    requiere_folios TINYINT(1) NOT NULL DEFAULT 1,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_tipos_nombre (nombre),
    UNIQUE KEY uq_tipos_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE modulos (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    codigo VARCHAR(6) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_modulos_nombre (nombre),
    UNIQUE KEY uq_modulos_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE estatus_ticket (
    codigo VARCHAR(20) NOT NULL PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL,
    clase_color VARCHAR(10) NOT NULL,
    es_final TINYINT(1) NOT NULL DEFAULT 0,
    orden TINYINT UNSIGNED NOT NULL
  ) ${T}`,

  // ------------------------------------------------------------ usuarios y sesiones
  `CREATE TABLE usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    nombre VARCHAR(120) NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol_id SMALLINT UNSIGNED NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta DATETIME(3) NULL,
    ultimo_login_at DATETIME(3) NULL,
    password_cambiado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    eliminado_at DATETIME(3) NULL,
    origen ENUM('SISTEMA','IMPORTADO') NOT NULL DEFAULT 'SISTEMA',
    id_anterior INT NULL,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_usuarios_username (username),
    UNIQUE KEY uq_usuarios_anterior (origen, id_anterior),
    KEY ix_usuarios_rol (rol_id, eliminado_at),
    KEY ix_usuarios_email (email),
    CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles (id)
  ) ${T}`,

  `CREATE TABLE usuario_empresas (
    usuario_id INT UNSIGNED NOT NULL,
    empresa_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (usuario_id, empresa_id),
    KEY ix_ue_empresa (empresa_id),
    CONSTRAINT fk_ue_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_ue_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id)
  ) ${T}`,

  `CREATE TABLE sesiones (
    id CHAR(64) NOT NULL PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    csrf_token CHAR(64) NOT NULL,
    creada_at DATETIME(3) NOT NULL,
    ultima_actividad_at DATETIME(3) NOT NULL,
    expira_absoluta_at DATETIME(3) NOT NULL,
    cerrada_at DATETIME(3) NULL,
    motivo_cierre ENUM('LOGOUT','INACTIVIDAD','EXPIRADA','ADMIN','BAJA','PASSWORD') NULL,
    cerrada_por_id INT UNSIGNED NULL,
    ip VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255) NOT NULL,
    KEY ix_sesiones_usuario (usuario_id, cerrada_at, ultima_actividad_at),
    KEY ix_sesiones_limpieza (cerrada_at, ultima_actividad_at),
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  ) ${T}`,

  `CREATE TABLE intentos_login (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    usuario_id INT UNSIGNED NULL,
    ip VARCHAR(45) NOT NULL,
    exito TINYINT(1) NOT NULL,
    motivo VARCHAR(40) NULL,
    ${CREADO},
    KEY ix_il_username (username, creado_at),
    KEY ix_il_ip (ip, creado_at),
    KEY ix_il_fecha (creado_at)
  ) ${T}`,

  // ------------------------------------------------------------ tickets
  `CREATE TABLE folio_consecutivos (
    prefijo VARCHAR(10) NOT NULL PRIMARY KEY,
    ultimo INT UNSIGNED NOT NULL,
    ${ACTUALIZADO}
  ) ${T}`,

  `CREATE TABLE tickets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    folio VARCHAR(20) NOT NULL,
    tipo_id SMALLINT UNSIGNED NOT NULL,
    empresa_id SMALLINT UNSIGNED NOT NULL,
    modulo_id SMALLINT UNSIGNED NULL,
    concepto VARCHAR(200) NULL,
    folios_ref VARCHAR(500) NULL,
    descripcion_html MEDIUMTEXT NOT NULL,
    descripcion_texto TEXT NOT NULL,
    estatus VARCHAR(20) NOT NULL,
    solicitante_id INT UNSIGNED NOT NULL,
    creado_por_id INT UNSIGNED NOT NULL,
    asignado_a_id INT UNSIGNED NULL,
    tomado_at DATETIME(3) NULL,
    primera_respuesta_at DATETIME(3) NULL,
    pausado_at DATETIME(3) NULL,
    cerrado_at DATETIME(3) NULL,
    cerrado_por_id INT UNSIGNED NULL,
    version INT UNSIGNED NOT NULL DEFAULT 0,
    origen ENUM('SISTEMA','IMPORTADO') NOT NULL DEFAULT 'SISTEMA',
    id_anterior BIGINT NULL,
    ${CREADO}, ${ACTUALIZADO},
    UNIQUE KEY uq_tickets_folio (folio),
    UNIQUE KEY uq_tickets_anterior (origen, id_anterior),
    KEY ix_tickets_estatus (estatus, creado_at),
    KEY ix_tickets_solicitante (solicitante_id, estatus, creado_at),
    KEY ix_tickets_asignado (asignado_a_id, estatus, creado_at),
    KEY ix_tickets_empresa (empresa_id, creado_at),
    KEY ix_tickets_tipo (tipo_id, creado_at),
    KEY ix_tickets_modulo (modulo_id, creado_at),
    KEY ix_tickets_creado (creado_at),
    FULLTEXT KEY ft_tickets_texto (concepto, folios_ref, descripcion_texto),
    CONSTRAINT fk_tickets_tipo FOREIGN KEY (tipo_id) REFERENCES tipos_solicitud (id),
    CONSTRAINT fk_tickets_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id),
    CONSTRAINT fk_tickets_modulo FOREIGN KEY (modulo_id) REFERENCES modulos (id),
    CONSTRAINT fk_tickets_estatus FOREIGN KEY (estatus) REFERENCES estatus_ticket (codigo),
    CONSTRAINT fk_tickets_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios (id),
    CONSTRAINT fk_tickets_creado_por FOREIGN KEY (creado_por_id) REFERENCES usuarios (id),
    CONSTRAINT fk_tickets_asignado FOREIGN KEY (asignado_a_id) REFERENCES usuarios (id),
    CONSTRAINT fk_tickets_cerrado_por FOREIGN KEY (cerrado_por_id) REFERENCES usuarios (id)
  ) ${T}`,

  `CREATE TABLE ticket_copias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NULL,
    email VARCHAR(254) NOT NULL,
    nombre VARCHAR(120) NULL,
    ${CREADO},
    UNIQUE KEY uq_copias (ticket_id, email),
    KEY ix_copias_usuario (usuario_id),
    CONSTRAINT fk_copias_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_copias_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  ) ${T}`,

  `CREATE TABLE ticket_mensajes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    autor_id INT UNSIGNED NOT NULL,
    tipo ENUM('COMENTARIO','RESPUESTA','RESOLUCION') NOT NULL,
    cuerpo_html MEDIUMTEXT NOT NULL,
    cuerpo_texto TEXT NOT NULL,
    ${CREADO},
    KEY ix_mensajes_ticket (ticket_id, creado_at),
    CONSTRAINT fk_mensajes_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_mensajes_autor FOREIGN KEY (autor_id) REFERENCES usuarios (id)
  ) ${T}`,

  `CREATE TABLE adjuntos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    ticket_id BIGINT UNSIGNED NULL,
    mensaje_id BIGINT UNSIGNED NULL,
    subido_por_id INT UNSIGNED NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    ruta_relativa VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    tamano_bytes INT UNSIGNED NOT NULL,
    sha256 CHAR(64) NOT NULL,
    en_linea TINYINT(1) NOT NULL DEFAULT 0,
    ${CREADO},
    eliminado_at DATETIME(3) NULL,
    UNIQUE KEY uq_adjuntos_uuid (uuid),
    KEY ix_adjuntos_ticket (ticket_id, mensaje_id),
    KEY ix_adjuntos_temporales (ticket_id, creado_at),
    CONSTRAINT fk_adjuntos_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_adjuntos_mensaje FOREIGN KEY (mensaje_id) REFERENCES ticket_mensajes (id) ON DELETE CASCADE,
    CONSTRAINT fk_adjuntos_usuario FOREIGN KEY (subido_por_id) REFERENCES usuarios (id)
  ) ${T}`,

  `CREATE TABLE ticket_eventos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    actor_id INT UNSIGNED NULL,
    tipo VARCHAR(40) NOT NULL,
    estatus_antes VARCHAR(20) NULL,
    estatus_despues VARCHAR(20) NULL,
    datos JSON NULL,
    ${CREADO},
    KEY ix_eventos_ticket (ticket_id, creado_at),
    KEY ix_eventos_tipo (tipo, creado_at),
    CONSTRAINT fk_eventos_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_eventos_actor FOREIGN KEY (actor_id) REFERENCES usuarios (id)
  ) ${T}`,

  // ------------------------------------------------------------ correo
  `CREATE TABLE plantillas_correo (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(40) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    asunto VARCHAR(255) NOT NULL,
    cuerpo_html MEDIUMTEXT NOT NULL,
    variables JSON NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    actualizado_por_id INT UNSIGNED NULL,
    ${ACTUALIZADO},
    UNIQUE KEY uq_plantillas_codigo (codigo)
  ) ${T}`,

  `CREATE TABLE correos_salida (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    plantilla_codigo VARCHAR(40) NULL,
    ticket_id BIGINT UNSIGNED NULL,
    para JSON NOT NULL,
    cc JSON NULL,
    asunto VARCHAR(255) NOT NULL,
    cuerpo_html MEDIUMTEXT NOT NULL,
    cuerpo_texto MEDIUMTEXT NOT NULL,
    estado ENUM('PENDIENTE','ENVIANDO','ENVIADO','FALLIDO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_intentos TINYINT UNSIGNED NOT NULL DEFAULT 7,
    proximo_intento_at DATETIME(3) NOT NULL,
    bloqueado_hasta DATETIME(3) NULL,
    ultimo_error VARCHAR(1000) NULL,
    transporte VARCHAR(20) NULL,
    id_mensaje_proveedor VARCHAR(255) NULL,
    ${CREADO},
    enviado_at DATETIME(3) NULL,
    KEY ix_correos_cola (estado, proximo_intento_at),
    KEY ix_correos_ticket (ticket_id),
    KEY ix_correos_fecha (creado_at),
    CONSTRAINT fk_correos_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE SET NULL
  ) ${T}`,

  // ------------------------------------------------------------ configuración y auditoría
  `CREATE TABLE ajustes (
    clave VARCHAR(60) NOT NULL PRIMARY KEY,
    valor JSON NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    actualizado_por_id INT UNSIGNED NULL,
    ${ACTUALIZADO}
  ) ${T}`,

  `CREATE TABLE auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_id INT UNSIGNED NULL,
    entidad VARCHAR(40) NOT NULL,
    entidad_id VARCHAR(40) NOT NULL,
    accion VARCHAR(40) NOT NULL,
    datos JSON NULL,
    ip VARCHAR(45) NULL,
    ${CREADO},
    KEY ix_auditoria_entidad (entidad, entidad_id, creado_at),
    KEY ix_auditoria_actor (actor_id, creado_at)
  ) ${T}`,
];

const TABLAS = [
  'auditoria',
  'ajustes',
  'correos_salida',
  'plantillas_correo',
  'ticket_eventos',
  'adjuntos',
  'ticket_mensajes',
  'ticket_copias',
  'tickets',
  'folio_consecutivos',
  'intentos_login',
  'sesiones',
  'usuario_empresas',
  'usuarios',
  'estatus_ticket',
  'modulos',
  'tipos_solicitud',
  'empresas',
  'rol_permisos',
  'permisos',
  'roles',
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const s of SENTENCIAS) await sql.raw(s).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of TABLAS) await sql.raw(`DROP TABLE IF EXISTS ${t}`).execute(db);
}
