// Formato de folio: [DEPTO]-[CONSECUTIVO].  Ej. VEN-0001, SIS-0008.
//   DEPTO        código corto en mayúsculas del departamento (catálogo configurable, no hardcodeado)
//   CONSECUTIVO  4 dígitos con ceros a la izquierda (crece a 5 al pasar de 9999); por departamento y
//                continuo: nunca se reinicia, así un folio jamás se repite. Sin año desde octubre de 2026;
//                los tickets anteriores conservan su folio DEPTO-AAAA-NNNN.
// Si se cambia el formato, este es el único lugar.

/** Código de departamento: de 2 a 6 letras o números en mayúsculas (SIS, RH, CONTA…). */
export const CODIGO_DEPARTAMENTO_REGEX = /^[A-Z0-9]{2,6}$/;

/** Códigos cortos de otros catálogos (empresas, tipos): para reportes, ya no forman parte del folio. */
export const CODIGO_CATALOGO_REGEX = /^[A-Z0-9]{2,4}$/;

export function formatearFolio(departamento: string, consecutivo: number): string {
  const d = departamento.trim().toUpperCase();
  if (!CODIGO_DEPARTAMENTO_REGEX.test(d)) throw new Error(`Código de departamento inválido: "${departamento}"`);
  if (!Number.isInteger(consecutivo) || consecutivo < 1) throw new Error(`Consecutivo inválido: ${consecutivo}`);
  return `${d}-${String(consecutivo).padStart(4, '0')}`;
}

/** Año en curso en una zona horaria (el 31 de diciembre a las 11 p.m. en México sigue siendo ese año). */
export function anioEnZona(fecha: Date, zonaHoraria: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria, year: 'numeric' }).format(fecha));
}
