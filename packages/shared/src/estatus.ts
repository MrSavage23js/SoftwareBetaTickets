// Estatus de ticket. El catálogo `estatus_ticket` en BD guarda nombre, color y orden;
// aquí viven los códigos porque las reglas de transición (maquina-estados.ts) dependen de ellos.
export const ESTATUS = {
  PENDIENTE: 'PENDIENTE',
  EN_PROCESO: 'EN_PROCESO',
  PAUSADO: 'PAUSADO',
  COMPLETADO: 'COMPLETADO',
  NO_PROCEDE: 'NO_PROCEDE',
} as const;

export type Estatus = (typeof ESTATUS)[keyof typeof ESTATUS];

export const LISTA_ESTATUS: readonly Estatus[] = [
  ESTATUS.PENDIENTE,
  ESTATUS.EN_PROCESO,
  ESTATUS.PAUSADO,
  ESTATUS.COMPLETADO,
  ESTATUS.NO_PROCEDE,
];

/** Datos de presentación por defecto (los mismos que siembra la BD). */
export const INFO_ESTATUS: Record<Estatus, { nombre: string; plural: string; clase: string; esFinal: boolean }> = {
  PENDIENTE: { nombre: 'Pendiente', plural: 'Pendientes', clase: 'pend', esFinal: false },
  EN_PROCESO: { nombre: 'En proceso', plural: 'En proceso', clase: 'proc', esFinal: false },
  PAUSADO: { nombre: 'Pausado', plural: 'Pausados', clase: 'paus', esFinal: false },
  COMPLETADO: { nombre: 'Completado', plural: 'Completados', clase: 'comp', esFinal: true },
  NO_PROCEDE: { nombre: 'No procede', plural: 'No procede', clase: 'nopr', esFinal: true },
};

export function esEstatus(v: unknown): v is Estatus {
  return typeof v === 'string' && (LISTA_ESTATUS as readonly string[]).includes(v);
}

/** Pasos de la barra de avance: Creado → Tomado → En proceso → Cerrado. */
export interface MarcasAvance {
  creadoAt: string | Date;
  tomadoAt: string | Date | null;
  primeraRespuestaAt: string | Date | null;
  cerradoAt: string | Date | null;
  estatus: Estatus;
}

export function pasosCompletados(t: MarcasAvance): 1 | 2 | 3 | 4 {
  if (t.estatus === ESTATUS.COMPLETADO || t.estatus === ESTATUS.NO_PROCEDE) return 4;
  if (t.primeraRespuestaAt) return 3;
  if (t.tomadoAt) return 2;
  return 1;
}
