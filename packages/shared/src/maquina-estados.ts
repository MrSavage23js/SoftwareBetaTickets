// Reglas de negocio de los tickets: qué acción se puede hacer, desde qué estatus y quién.
// El servidor es quien decide (usa `validarAccion`); la web solo la usa para mostrar u ocultar botones.
import { ESTATUS, type Estatus } from './estatus';
import { PERMISOS, type Permiso } from './permisos';

export const ACCIONES = [
  'tomar',
  'pausar',
  'reanudar',
  'reasignar',
  'responder',
  'cerrar',
  'reabrir',
  'comentar',
] as const;
export type Accion = (typeof ACCIONES)[number];

export interface TicketParaReglas {
  estatus: Estatus;
  solicitanteId: number;
  asignadoAId: number | null;
}

export interface ActorParaReglas {
  id: number;
  permisos: ReadonlySet<string> | readonly string[];
}

interface Regla {
  desde: readonly Estatus[];
  /** Estatus resultante; `null` = no cambia. */
  hacia: Estatus | null;
  permiso: Permiso;
  /** Quién además de tener el permiso puede ejecutarla. */
  quien: 'cualquiera' | 'asignado' | 'solicitante';
  /** Requiere que el ticket no tenga técnico asignado. */
  sinAsignar?: boolean;
}

const ABIERTOS = [ESTATUS.PENDIENTE, ESTATUS.EN_PROCESO, ESTATUS.PAUSADO] as const;
const ATENDIENDO = [ESTATUS.EN_PROCESO, ESTATUS.PAUSADO] as const;

export const REGLAS: Record<Accion, Regla> = {
  tomar: {
    desde: [ESTATUS.PENDIENTE],
    hacia: ESTATUS.EN_PROCESO,
    permiso: PERMISOS.TICKETS_TOMAR,
    quien: 'cualquiera',
    sinAsignar: true,
  },
  pausar: {
    desde: [ESTATUS.EN_PROCESO],
    hacia: ESTATUS.PAUSADO,
    permiso: PERMISOS.TICKETS_PAUSAR,
    quien: 'asignado',
  },
  reanudar: {
    desde: [ESTATUS.PAUSADO],
    hacia: ESTATUS.EN_PROCESO,
    permiso: PERMISOS.TICKETS_PAUSAR,
    quien: 'asignado',
  },
  reasignar: { desde: ATENDIENDO, hacia: null, permiso: PERMISOS.TICKETS_REASIGNAR, quien: 'cualquiera' },
  responder: { desde: ATENDIENDO, hacia: null, permiso: PERMISOS.TICKETS_RESPONDER, quien: 'asignado' },
  cerrar: { desde: ATENDIENDO, hacia: ESTATUS.COMPLETADO, permiso: PERMISOS.TICKETS_CERRAR, quien: 'asignado' },
  reabrir: {
    desde: [ESTATUS.COMPLETADO],
    hacia: ESTATUS.EN_PROCESO,
    permiso: PERMISOS.TICKETS_REABRIR,
    quien: 'cualquiera',
  },
  comentar: {
    desde: ABIERTOS,
    hacia: null,
    permiso: PERMISOS.TICKETS_COMENTAR_PROPIOS,
    quien: 'solicitante',
  },
};

export type ResultadoAccion =
  | { ok: true; estatusNuevo: Estatus }
  | { ok: false; codigo: 'SIN_PERMISO' | 'ESTATUS_INVALIDO' | 'NO_ASIGNADO' | 'YA_ASIGNADO'; mensaje: string };

const tiene = (a: ActorParaReglas, p: string) =>
  a.permisos instanceof Set ? a.permisos.has(p) : (a.permisos as readonly string[]).includes(p);

const MENSAJE_ESTATUS: Record<Accion, string> = {
  tomar: 'Solo se pueden tomar tickets pendientes.',
  pausar: 'Solo se pueden pausar tickets en proceso.',
  reanudar: 'Solo se pueden reanudar tickets pausados.',
  reasignar: 'Solo se pueden reasignar tickets en proceso o pausados.',
  responder: 'Toma el ticket para poder responder. Los tickets completados no admiten respuestas.',
  cerrar: 'Solo se pueden cerrar tickets en proceso o pausados.',
  reabrir: 'Solo se pueden reabrir tickets completados.',
  comentar: 'El ticket ya está completado y no admite más comentarios.',
};

export function validarAccion(accion: Accion, t: TicketParaReglas, actor: ActorParaReglas): ResultadoAccion {
  const r = REGLAS[accion];
  if (!tiene(actor, r.permiso)) {
    return { ok: false, codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para realizar esta acción.' };
  }
  if (r.quien === 'solicitante' && t.solicitanteId !== actor.id) {
    return { ok: false, codigo: 'SIN_PERMISO', mensaje: 'Solo el solicitante puede comentar en este ticket.' };
  }
  if (!r.desde.includes(t.estatus)) {
    return { ok: false, codigo: 'ESTATUS_INVALIDO', mensaje: MENSAJE_ESTATUS[accion] };
  }
  if (r.sinAsignar && t.asignadoAId !== null) {
    return { ok: false, codigo: 'YA_ASIGNADO', mensaje: 'Otro técnico ya tomó este ticket.' };
  }
  if (r.quien === 'asignado' && t.asignadoAId !== actor.id) {
    return { ok: false, codigo: 'NO_ASIGNADO', mensaje: 'Solo el técnico asignado puede realizar esta acción.' };
  }
  return { ok: true, estatusNuevo: r.hacia ?? t.estatus };
}

export function accionesDisponibles(t: TicketParaReglas, actor: ActorParaReglas): Accion[] {
  return ACCIONES.filter((a) => validarAccion(a, t, actor).ok);
}
