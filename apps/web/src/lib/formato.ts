// Fechas y tamaños en español de México, en la zona horaria del navegador.
const dia = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
const fechaHora = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const d = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

/** "lunes, 28 de septiembre de 2026" */
export const fmtDia = (v: string | Date) => dia.format(d(v));
/** "8:57 a. m." */
export const fmtHora = (v: string | Date) => hora.format(d(v));
/** "28 sept 2026, 8:57 a. m." */
export const fmtFechaHora = (v: string | Date) => fechaHora.format(d(v));
/** "28/09/2026 08:57" (tablas) */
export const fmtFechaCorta = (v: string | Date) => fechaCorta.format(d(v));

/** Clave del día local (para agrupar la lista por día). */
export function claveDia(v: string | Date): string {
  const x = d(v);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function etiquetaDia(v: string | Date): string {
  const hoy = claveDia(new Date());
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const k = claveDia(v);
  if (k === hoy) return `Hoy, ${fmtDia(v)}`;
  if (k === claveDia(ayer)) return `Ayer, ${fmtDia(v)}`;
  return fmtDia(v);
}

export function fmtTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.replace(/[_.-]+/g, ' ').trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase();
}

export const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`;
