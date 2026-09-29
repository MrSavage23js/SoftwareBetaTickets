// Formato de folio: [código empresa][código tipo]-[consecutivo, mínimo 4 dígitos].  Ej. ASCA-0063.
// El consecutivo se lleva por prefijo (DECISIONES D10). Si se cambia el formato, este es el único lugar.
export const CODIGO_CATALOGO_REGEX = /^[A-Z0-9]{2,4}$/;

export function prefijoFolio(codigoEmpresa: string, codigoTipo: string): string {
  const e = codigoEmpresa.trim().toUpperCase();
  const t = codigoTipo.trim().toUpperCase();
  if (!CODIGO_CATALOGO_REGEX.test(e) || !CODIGO_CATALOGO_REGEX.test(t)) {
    throw new Error(`Códigos de folio inválidos: "${codigoEmpresa}" / "${codigoTipo}"`);
  }
  return e + t;
}

export function formatearFolio(prefijo: string, consecutivo: number): string {
  if (!Number.isInteger(consecutivo) || consecutivo < 1) {
    throw new Error(`Consecutivo inválido: ${consecutivo}`);
  }
  return `${prefijo}-${String(consecutivo).padStart(4, '0')}`;
}
