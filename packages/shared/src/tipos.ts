// Formas de las respuestas de la API (contrato entre servidor y web). Las fechas viajan como ISO 8601 UTC.
import type { Estatus } from './estatus';
import type { Accion } from './maquina-estados';

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
  /** Minutos de inactividad antes del cierre (la web avisa 1 minuto antes). */
  inactividadMin: number;
  /** Límites de adjuntos vigentes (la web valida antes de subir; el servidor vuelve a validar). */
  adjuntos: { maxMb: number; maxPorMensaje: number; tipos: string[] };
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
  empresas: Ref[];
  activo: boolean;
  ultimoLoginAt: string | null;
  enLinea: boolean;
  creadoAt: string;
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
  tipo: Ref;
  modulo: Ref | null;
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
