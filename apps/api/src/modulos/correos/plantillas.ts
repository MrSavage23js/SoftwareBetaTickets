// Motor de plantillas mínimo y seguro:
//   {{variable}}   → se escapa (texto)          — cualquier variable
//   {{{variable}}} → se inserta como HTML        — solo variables que terminan en _html (ya sanitizadas)
// Una variable desconocida se reemplaza por vacío. No hay lógica ni bucles: no se puede ejecutar nada.
import { env } from '../../config/env';

export type Variables = Record<string, string | number | null | undefined>;

const escaparHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function valor(vars: Variables, nombre: string): string {
  const v = vars[nombre];
  if (v === null || v === undefined || v === '') return nombre.endsWith('_html') ? '' : '—';
  const s = String(v);
  // Las URL solo pueden apuntar al propio sistema (evita que una plantilla editada mande a otro sitio).
  if (nombre.startsWith('url') && !s.startsWith(env.APP_URL)) return env.APP_URL;
  return s;
}

export function renderizarHtml(plantilla: string, vars: Variables): string {
  return plantilla
    .replace(/\{\{\{\s*([a-z0-9_]+)\s*\}\}\}/gi, (_m, n: string) => (n.endsWith('_html') ? valor(vars, n) : escaparHtml(valor(vars, n))))
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, n: string) => escaparHtml(valor(vars, n)));
}

/** Para el asunto: texto plano, sin saltos de línea (evita inyección de cabeceras). */
export function renderizarTexto(plantilla: string, vars: Variables): string {
  return plantilla
    .replace(/\{\{\{?\s*([a-z0-9_]+)\s*\}?\}\}/gi, (_m, n: string) => valor(vars, n))
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 250);
}

export const VARIABLES_EJEMPLO: Variables = {
  folio: 'SIS-2026-0063',
  departamento: 'Sistemas / TI',
  tipo: 'Cancelación',
  empresa: 'Autotransportes Asturcones',
  modulo: 'Compras',
  concepto: 'CARTA PORTE',
  folios: 'B12345',
  estatus: 'Pendiente',
  solicitante: 'Laura_Mendez',
  fecha: '28 de septiembre de 2026, 8:57 a.m.',
  fecha_cierre: '28 de septiembre de 2026, 11:20 a.m.',
  tecnico: 'Pedro_Salas',
  url_ticket: `${env.APP_URL}/tickets/1`,
  empresa_sistema: env.APP_NOMBRE_EMPRESA,
  resolucion_html: '<p>Se canceló la carta porte B12345 y se generó una nueva con las cajas correctas.</p>',
  mensaje_html: '<p>Estamos revisando tu solicitud; te aviso en cuanto quede.</p>',
  descripcion_html: '<p>Buenos días, me pueden ayudar a cancelar la carta porte B12345…</p>',
};
