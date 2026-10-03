// Formas de las respuestas de la API (contrato entre servidor y web). Las fechas viajan como ISO 8601 UTC.
import type { Apariencia } from './apariencia';
import type { Estatus } from './estatus';
import type { Accion } from './maquina-estados';
import type { Urgencia } from './urgencia';

export interface ErrorApi {
  error: {
    codigo: string;
    mensaje: string;
    campos?: Record<string, string>;
  };
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Ref {
  id: number;
  nombre: string;
}

export interface UsuarioRef extends Ref {
  username: string;
}

export interface UsuarioSesion {
  id: number;
  username: string;
  nombre: string;
  email: string;
  rol: { codigo: string; nombre: string };
  permisos: string[];
  empresas: Ref[];
  /** Departamento del usuario (se propone al crear un ticket). */
  departamento: Ref | null;
  /** Minutos de inactividad antes del cierre (la web avisa 1 minuto antes). */
  inactividadMin: number;
  /** El admin asignó o restableció la contraseña: hay que cambiarla antes de usar el sistema. */
  debeCambiarPassword: boolean;
  /** Límites de adjuntos vigentes (la web valida antes de subir; el servidor vuelve a validar). */
  adjuntos: { maxMb: number; maxPorMensaje: number; tipos: string[] };
  /** Modo claro/oscuro y paleta de color que eligió el usuario. */
  apariencia: Apariencia;
}

export interface RespuestaSesion {
  usuario: UsuarioSesion;
  csrfToken: string;
}

export interface UsuarioFila {
  id: number;
  username: string;
  nombre: string | null;
  email: string;
  rol: { id: number; codigo: string; nombre: string };
  departamento: Ref | null;
  empresas: Ref[];
  activo: boolean;
  ultimoLoginAt: string | null;
  enLinea: boolean;
  creadoAt: string;
}

export interface DepartamentoFila {
  id: number;
  nombre: string;
  codigo: string;
  activo: boolean;
  orden: number;
  tickets?: number;
  usuarios?: number;
}

export interface EmpresaFila {
  id: number;
  nombre: string;
  codigo: string;
  activa: boolean;
  orden: number;
  usuarios?: number;
  tickets?: number;
}

export interface TipoSolicitudFila {
  id: number;
  nombre: string;
  codigo: string;
  tituloDetalle: string;
  requiereModulo: boolean;
  requiereConcepto: boolean;
  requiereFolios: boolean;
  activo: boolean;
  orden: number;
  tickets?: number;
}

export interface ModuloFila {
  id: number;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  orden: number;
  tickets?: number;
}

export interface Catalogos {
  departamentos: DepartamentoFila[];
  empresas: EmpresaFila[];
  tipos: TipoSolicitudFila[];
  modulos: ModuloFila[];
  estatus: { codigo: Estatus; nombre: string; clase: string; orden: number }[];
}

export interface AdjuntoInfo {
  uuid: string;
  nombre: string;
  mime: string;
  tamano: number;
  enLinea: boolean;
  url: string;
}

export interface TicketResumen {
  id: number;
  folio: string;
  estatus: Estatus;
  urgencia: Urgencia;
  tipo: Ref;
  modulo: Ref | null;
  departamento: Ref;
  empresa: Ref;
  concepto: string | null;
  solicitante: UsuarioRef;
  asignado: UsuarioRef | null;
  creadoAt: string;
}

export interface MensajeInfo {
  id: number;
  tipo: 'COMENTARIO' | 'RESPUESTA' | 'RESOLUCION';
  autor: UsuarioRef;
  esSoporte: boolean;
  html: string;
  creadoAt: string;
  adjuntos: AdjuntoInfo[];
}

export interface EventoInfo {
  id: number;
  tipo: string;
  actor: UsuarioRef | null;
  estatusAntes: Estatus | null;
  estatusDespues: Estatus | null;
  datos: Record<string, unknown> | null;
  creadoAt: string;
}

export interface CopiaInfo {
  email: string;
  nombre: string | null;
  usuarioId: number | null;
}

export interface TicketDetalle extends TicketResumen {
  foliosRef: string | null;
  descripcionHtml: string;
  tituloDetalle: string;
  creadoPor: UsuarioRef;
  tomadoAt: string | null;
  primeraRespuestaAt: string | null;
  pausadoAt: string | null;
  cerradoAt: string | null;
  cerradoPor: UsuarioRef | null;
  version: number;
  copias: CopiaInfo[];
  adjuntos: AdjuntoInfo[];
  mensajes: MensajeInfo[];
  acciones: Accion[];
}

export interface ContadoresEstatus {
  total: number;
  PENDIENTE: number;
  EN_PROCESO: number;
  PAUSADO: number;
  COMPLETADO: number;
  NO_PROCEDE: number;
}

export interface TicketCreado {
  id: number;
  folio: string;
  correosEncolados: number;
}

export interface CorreoFila {
  id: number;
  plantillaCodigo: string | null;
  ticketFolio: string | null;
  para: { email: string; nombre?: string }[];
  asunto: string;
  estado: 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'FALLIDO' | 'CANCELADO';
  intentos: number;
  proximoIntentoAt: string | null;
  ultimoError: string | null;
  creadoAt: string;
  enviadoAt: string | null;
}

export interface PlantillaFila {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  asunto: string;
  cuerpoHtml: string;
  variables: { nombre: string; descripcion: string }[];
  activa: boolean;
  actualizadoAt: string;
}

export interface AjusteFila {
  clave: string;
  valor: unknown;
  descripcion: string;
}

export interface PanelResumen {
  /** Pendientes + en proceso + pausados. */
  abiertos: number;
  pendientes: number;
  enProceso: number;
  pausados: number;
  cerradosHoy: number;
  /** Desde el lunes de esta semana (hora local del sistema). */
  cerradosSemana: number;
  /** Pendientes (nadie los ha tomado) por urgencia crítica o alta. */
  criticosSinAtender: number;
  altosSinAtender: number;
  abiertosPorDepartamento: { id: number; nombre: string; codigo: string; total: number }[];
  abiertosPorUrgencia: { urgencia: Urgencia; total: number }[];
  generadoAt: string;
}

/** Periodos que ofrece el dashboard para las gráficas y la exportación (días hacia atrás desde hoy). */
export const PERIODOS_PANEL = [7, 30, 90, 365] as const;
export type PeriodoPanel = (typeof PERIODOS_PANEL)[number];

/** Gráficas del dashboard para un periodo. Fechas AAAA-MM-DD en la zona horaria del sistema. */
export interface PanelAnalitica {
  dias: PeriodoPanel;
  desde: string;
  hasta: string;
  /** Tamaño de cada punto de la tendencia: día (7 y 30 días), semana (90) o mes (12 meses). */
  agrupacion: 'dia' | 'semana' | 'mes';
  /** Un punto por día/semana/mes (también los que están en cero); `fecha` es el inicio del intervalo.
   *  Resueltos = completados en ese intervalo. */
  tendencia: { fecha: string; creados: number; resueltos: number }[];
  /** Tickets creados en el periodo. */
  porTipo: { id: number; nombre: string; total: number }[];
  /** Tickets creados en el periodo; las empresas fuera de las 7 primeras se agrupan en "Otras" (id null). */
  porEmpresa: { id: number | null; nombre: string; total: number }[];
  /** Tickets completados en el periodo por quien los cerró. */
  resueltosPorTecnico: { id: number; nombre: string; total: number }[];
  /** Horas promedio de creación a cierre de los completados en el periodo. */
  horasResolucionPorTipo: { id: number; nombre: string; horas: number; resueltos: number }[];
  generadoAt: string;
}

export type TipoNotificacion = 'nuevo_ticket' | 'ticket_contestado';

export interface NotificacionInfo {
  id: number;
  tipo: TipoNotificacion;
  mensaje: string;
  leida: boolean;
  ticket: { id: number; folio: string };
  creadoAt: string;
}

export interface ListaNotificaciones {
  noLeidas: number;
  datos: NotificacionInfo[];
}
