import { env } from '../config/env';

const largo = new Intl.DateTimeFormat('es-MX', {
  timeZone: env.APP_TZ,
  dateStyle: 'long',
  timeStyle: 'short',
});

/** "28 de septiembre de 2026, 8:57 a.m." en la zona horaria del sistema (para correos). */
export function fechaLarga(d: Date): string {
  return largo.format(d);
}

export const minutos = (n: number) => n * 60_000;

export function sumarMinutos(d: Date, n: number): Date {
  return new Date(d.getTime() + minutos(n));
}

/** Convierte AAAA-MM-DD (fecha local del sistema) al instante UTC de inicio de ese día. */
export function inicioDiaLocal(fecha: string): Date {
  return instanteLocal(fecha, '00:00:00');
}

/** Instante UTC del inicio del día siguiente (para rangos "hasta" inclusivos). */
export function finDiaLocal(fecha: string): Date {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return instanteLocal(d.toISOString().slice(0, 10), '00:00:00');
}

function instanteLocal(fecha: string, hora: string): Date {
  // Se calcula el desfase de la zona para esa fecha (respeta cambios de horario).
  const utc = new Date(`${fecha}T${hora}Z`);
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: env.APP_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utc);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoLocal = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return new Date(utc.getTime() - (comoLocal - utc.getTime()));
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del sistema. */
export function hoyLocal(ahora = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: env.APP_TZ });
}

/** Fecha (AAAA-MM-DD) del lunes de la semana en curso, en la zona horaria del sistema. */
export function lunesLocal(ahora = new Date()): string {
  const hoy = hoyLocal(ahora);
  const d = new Date(`${hoy}T12:00:00Z`);
  const diasDesdeLunes = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diasDesdeLunes);
  return d.toISOString().slice(0, 10);
}
