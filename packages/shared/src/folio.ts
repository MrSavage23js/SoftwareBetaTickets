// Formato de folio: [DEPTO]-[AÑO]-[CONSECUTIVO].  Ej. SIS-2026-0001, RH-2026-0001.
//   DEPTO        código corto en mayúsculas del departamento (catálogo configurable, no hardcodeado)
//   AÑO          año en curso, 4 dígitos (en la zona horaria del sistema)
//   CONSECUTIVO  4 dígitos con ceros a la izquierda; se reinicia en 0001 cada 1 de enero, por departamento
// Si se cambia el formato, este es el único lugar.

/** Código de departamento: de 2 a 6 letras o números en mayúsculas (SIS, RH, CONTA…). */
export const CODIGO_DEPARTAMENTO_REGEX = /^[A-Z0-9]{2,6}$/;

/** Códigos cortos de otros catálogos (empresas, tipos): para reportes, ya no forman parte del folio. */
export const CODIGO_CATALOGO_REGEX = /^[A-Z0-9]{2,4}$/;

export function formatearFolio(departamento: string, anio: number, consecutivo: number): string {
  const d = departamento.trim().toUpperCase();
  if (!CODIGO_DEPARTAMENTO_REGEX.test(d)) throw new Error(`Código de departamento inválido: "${departamento}"`);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 9999) throw new Error(`Año inválido: ${anio}`);
  if (!Number.isInteger(consecutivo) || consecutivo < 1) throw new Error(`Consecutivo inválido: ${consecutivo}`);
  return `${d}-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

/** Año en curso en una zona horaria (el 31 de diciembre a las 11 p.m. en México sigue siendo ese año). */
export function anioEnZona(fecha: Date, zonaHoraria: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria, year: 'numeric' }).format(fecha));
}
