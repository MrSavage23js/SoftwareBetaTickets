// CSV para Power BI / Excel: UTF-8 con BOM (acentos correctos en Excel), coma como separador, punto
// decimal y fechas AAAA-MM-DD. Es el formato que Power BI importa con "Obtener datos → Texto/CSV".

export type Celda = string | number | null | undefined;

/** Un campo entre comillas si hace falta; los que empiezan con = + - @ se neutralizan (no son fórmulas). */
function campo(v: Celda): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v ?? '';
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCsv(columnas: string[], filas: Celda[][]): string {
  return '﻿' + [columnas, ...filas].map((f) => f.map(campo).join(',')).join('\r\n') + '\r\n';
}

/** Descarga un texto como archivo sin pasar por el servidor. */
export function descargarArchivo(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
