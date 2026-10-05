// Tipos de las tablas para Kysely. Deben coincidir con las migraciones (docs/MODELO_DATOS.md).
// Booleanos: columnas BOOLEAN que llegan como 0/1 (conversión en db/conexion.ts, como el TINYINT(1) de MySQL).
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Fecha = ColumnType<Date, Date | string | undefined, Date | string>;
type FechaNula = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Bool = ColumnType<number, boolean | number | undefined, boolean | number>;
type Json<T> = ColumnType<T, string, string>;

export interface RolesTabla {
  id: Generated<number>;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: Bool;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface PermisosTabla {
  id: Generated<number>;
  codigo: string;
  grupo: string;
  descripcion: string;
}

export interface RolPermisosTabla {
  rol_id: number;
  permiso_id: number;
}

export interface UsuariosTabla {
  id: Generated<number>;
  username: string;
  nombre: string | null;
  email: string;
  password_hash: string;
  rol_id: number;
  departamento_id: Generated<number | null>;
  activo: Bool;
  intentos_fallidos: Generated<number>;
  bloqueado_hasta: FechaNula;
  ultimo_login_at: FechaNula;
  password_cambiado_at: Fecha;
  debe_cambiar_password: Generated<number>;
  eliminado_at: FechaNula;
  origen: Generated<'SISTEMA' | 'IMPORTADO'>;
  id_anterior: number | null;
  /** Modo y paleta elegidos (JSONB); se lee con leerApariencia() de @mesa/shared. */
  apariencia: ColumnType<unknown, string | null | undefined, string | null>;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface UsuarioEmpresasTabla {
  usuario_id: number;
  empresa_id: number;
}

export type MotivoCierreSesion = 'LOGOUT' | 'INACTIVIDAD' | 'EXPIRADA' | 'ADMIN' | 'BAJA' | 'PASSWORD';

export interface SesionesTabla {
  id: string;
  usuario_id: number;
  csrf_token: string;
  creada_at: Fecha;
  ultima_actividad_at: Fecha;
  expira_absoluta_at: Fecha;
  cerrada_at: FechaNula;
  motivo_cierre: MotivoCierreSesion | null;
  cerrada_por_id: number | null;
  ip: string;
  user_agent: string;
}

export interface IntentosLoginTabla {
  id: Generated<number>;
  username: string;
  usuario_id: number | null;
  ip: string;
  exito: Bool;
  motivo: string | null;
  creado_at: Generated<Date>;
}

export interface EmpresasTabla {
  id: Generated<number>;
  nombre: string;
  codigo: string;
  activa: Bool;
  orden: Generated<number>;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface TiposSolicitudTabla {
  id: Generated<number>;
  nombre: string;
  codigo: string;
  titulo_detalle: string;
  requiere_modulo: Bool;
  requiere_concepto: Bool;
  requiere_folios: Bool;
  activo: Bool;
  orden: Generated<number>;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface ModulosTabla {
  id: Generated<number>;
  nombre: string;
  codigo: string | null;
  activo: Bool;
  orden: Generated<number>;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface EstatusTicketTabla {
  codigo: string;
  nombre: string;
  clase_color: string;
  es_final: Bool;
  orden: number;
}

export interface DepartamentosTabla {
  id: Generated<number>;
  nombre: string;
  codigo: string;
  activo: Bool;
  orden: Generated<number>;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface FolioContadoresTabla {
  departamento: string;
  anio: number;
  ultimo_consecutivo: number;
  actualizado_at: Generated<Date>;
}

export interface TicketsTabla {
  id: Generated<number>;
  folio: string;
  departamento_id: number;
  tipo_id: number;
  empresa_id: number;
  modulo_id: number | null;
  concepto: string | null;
  folios_ref: string | null;
  descripcion_html: string;
  descripcion_texto: string;
  estatus: string;
  urgencia: Generated<'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'>;
  solicitante_id: number;
  creado_por_id: number;
  asignado_a_id: number | null;
  tomado_at: FechaNula;
  primera_respuesta_at: FechaNula;
  pausado_at: FechaNula;
  cerrado_at: FechaNula;
  cerrado_por_id: number | null;
  version: Generated<number>;
  origen: Generated<'SISTEMA' | 'IMPORTADO'>;
  id_anterior: number | null;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface TicketCopiasTabla {
  id: Generated<number>;
  ticket_id: number;
  usuario_id: number | null;
  email: string;
  nombre: string | null;
  creado_at: Generated<Date>;
}

export type TipoMensaje = 'COMENTARIO' | 'RESPUESTA' | 'RESOLUCION';

export interface TicketMensajesTabla {
  id: Generated<number>;
  ticket_id: number;
  autor_id: number;
  tipo: TipoMensaje;
  cuerpo_html: string;
  cuerpo_texto: string;
  creado_at: Generated<Date>;
}

export interface AdjuntosTabla {
  id: Generated<number>;
  uuid: string;
  ticket_id: number | null;
  mensaje_id: number | null;
  subido_por_id: number;
  nombre_original: string;
  ruta_relativa: string;
  mime: string;
  tamano_bytes: number;
  sha256: string;
  en_linea: Bool;
  creado_at: Generated<Date>;
  eliminado_at: FechaNula;
}

export interface TicketEventosTabla {
  id: Generated<number>;
  ticket_id: number;
  actor_id: number | null;
  tipo: string;
  estatus_antes: string | null;
  estatus_despues: string | null;
  datos: Json<Record<string, unknown> | null> | null;
  creado_at: Generated<Date>;
}

export interface PlantillasCorreoTabla {
  id: Generated<number>;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  asunto: string;
  cuerpo_html: string;
  variables: Json<{ nombre: string; descripcion: string }[]>;
  activa: Bool;
  actualizado_por_id: number | null;
  actualizado_at: Generated<Date>;
}

export type EstadoCorreo = 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'FALLIDO' | 'CANCELADO';
export interface Destinatario {
  email: string;
  nombre?: string;
}

export interface CorreosSalidaTabla {
  id: Generated<number>;
  plantilla_codigo: string | null;
  ticket_id: number | null;
  para: Json<Destinatario[]>;
  cc: Json<Destinatario[] | null> | null;
  asunto: string;
  cuerpo_html: string;
  cuerpo_texto: string;
  estado: EstadoCorreo;
  intentos: Generated<number>;
  max_intentos: Generated<number>;
  proximo_intento_at: Fecha;
  bloqueado_hasta: FechaNula;
  ultimo_error: string | null;
  transporte: string | null;
  id_mensaje_proveedor: string | null;
  creado_at: Generated<Date>;
  enviado_at: FechaNula;
}

export interface NotificacionesTabla {
  id: Generated<number>;
  usuario_id: number;
  ticket_id: number;
  tipo: 'nuevo_ticket' | 'ticket_contestado';
  mensaje: string;
  leida: Generated<number>;
  creado_at: Generated<Date>;
}

export interface AjustesTabla {
  clave: string;
  valor: Json<unknown>;
  descripcion: string;
  actualizado_por_id: number | null;
  actualizado_at: Generated<Date>;
}

export interface AuditoriaTabla {
  id: Generated<number>;
  actor_id: number | null;
  entidad: string;
  entidad_id: string;
  accion: string;
  datos: Json<Record<string, unknown> | null> | null;
  ip: string | null;
  creado_at: Generated<Date>;
}

export interface RespuestasGuardadasTabla {
  id: Generated<number>;
  usuario_id: number;
  titulo: string;
  cuerpo_html: string;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface BD {
  roles: RolesTabla;
  permisos: PermisosTabla;
  rol_permisos: RolPermisosTabla;
  usuarios: UsuariosTabla;
  usuario_empresas: UsuarioEmpresasTabla;
  sesiones: SesionesTabla;
  intentos_login: IntentosLoginTabla;
  empresas: EmpresasTabla;
  tipos_solicitud: TiposSolicitudTabla;
  modulos: ModulosTabla;
  estatus_ticket: EstatusTicketTabla;
  departamentos: DepartamentosTabla;
  folio_contadores: FolioContadoresTabla;
  tickets: TicketsTabla;
  ticket_copias: TicketCopiasTabla;
  ticket_mensajes: TicketMensajesTabla;
  adjuntos: AdjuntosTabla;
  ticket_eventos: TicketEventosTabla;
  plantillas_correo: PlantillasCorreoTabla;
  correos_salida: CorreosSalidaTabla;
  ajustes: AjustesTabla;
  notificaciones: NotificacionesTabla;
  auditoria: AuditoriaTabla;
  respuestas_guardadas: RespuestasGuardadasTabla;
}

export type Usuario = Selectable<UsuariosTabla>;
export type Ticket = Selectable<TicketsTabla>;
export type NuevoTicket = Insertable<TicketsTabla>;
export type CambioTicket = Updateable<TicketsTabla>;
export type Sesion = Selectable<SesionesTabla>;
