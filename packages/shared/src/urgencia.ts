// Urgencia del ticket: valores fijos con su color (especificación del usuario).
// Los colores NO bastan solos (naranja/rojo se parecen; verde/amarillo se confunden con daltonismo):
// toda la interfaz los acompaña del nombre y de un indicador de nivel (1 a 4).
export const URGENCIAS = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type Urgencia = (typeof URGENCIAS)[number];

export const URGENCIA_POR_OMISION: Urgencia = 'MEDIA';

export const INFO_URGENCIA: Record<Urgencia, { nombre: string; color: string; nivel: 1 | 2 | 3 | 4 }> = {
  BAJA: { nombre: 'Baja', color: '#22c55e', nivel: 1 },
  MEDIA: { nombre: 'Media', color: '#eab308', nivel: 2 },
  ALTA: { nombre: 'Alta', color: '#f97316', nivel: 3 },
  CRITICA: { nombre: 'Crítica', color: '#ef4444', nivel: 4 },
};

/** De mayor a menor (para "ordenar por urgencia": crítica arriba). */
export const URGENCIAS_DESC: readonly Urgencia[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'];
