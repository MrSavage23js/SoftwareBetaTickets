// Gráficas del dashboard por periodo y exportación de tickets para Power BI.
// La BD guarda UTC; los días se agrupan en JS con la zona del sistema (APP_TZ) para que "hoy" sea el
// día local también con cambios de horario.
import { ESTATUS, INFO_ESTATUS, INFO_URGENCIA, type Estatus, type PanelAnalitica, type PeriodoPanel } from '@mesa/shared';
import { env } from '../../config/env';
import { db } from '../../db/conexion';
import { hoyLocal, inicioDiaLocal } from '../../lib/fechas';
import { nombreVisible } from '../auth/contexto';

const MAX_EMPRESAS = 7;
const HORA = 3_600_000;

const diaLocal = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: env.APP_TZ });

/** AAAA-MM-DD de hace `n` días (en la zona del sistema). */
function haceDias(hoy: string, n: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Lunes (AAAA-MM-DD) de la semana de una fecha. */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function contar<K>(mapa: Map<K, { nombre: string; total: number }>, clave: K, nombre: string) {
  const x = mapa.get(clave);
  if (x) x.total++;
  else mapa.set(clave, { nombre, total: 1 });
}

const ordenar = <T extends { total: number; nombre: string }>(xs: T[]) => xs.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));

export async function analiticaPanel(dias: PeriodoPanel, ahora = new Date()): Promise<PanelAnalitica> {
  const hasta = hoyLocal(ahora);
  const desde = haceDias(hasta, dias - 1);
  const inicio = inicioDiaLocal(desde);

  // Una sola consulta: lo creado o cerrado dentro del periodo, con los nombres que necesitan las gráficas.
  const filas = await db
    .selectFrom('tickets as t')
    .innerJoin('tipos_solicitud as ti', 'ti.id', 't.tipo_id')
    .innerJoin('empresas as e', 'e.id', 't.empresa_id')
    .leftJoin('usuarios as c', 'c.id', 't.cerrado_por_id')
    .select([
      't.estatus',
      't.creado_at',
      't.cerrado_at',
      'ti.id as tipo_id',
      'ti.nombre as tipo',
      'e.id as empresa_id',
      'e.nombre as empresa',
      'c.id as c_id',
      'c.username as c_username',
      'c.nombre as c_nombre',
    ])
    .where((eb) => eb.or([eb('t.creado_at', '>=', inicio), eb('t.cerrado_at', '>=', inicio)]))
    .execute();

  // Periodos largos se agrupan para que la línea se lea: semana (lunes) a 90 días, mes a 12 meses.
  const agrupacion: PanelAnalitica['agrupacion'] = dias >= 365 ? 'mes' : dias >= 90 ? 'semana' : 'dia';
  const intervalo = (fecha: string) => (agrupacion === 'mes' ? `${fecha.slice(0, 8)}01` : agrupacion === 'semana' ? lunesDe(fecha) : fecha);
  const tendencia = new Map<string, { creados: number; resueltos: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    const clave = intervalo(haceDias(hasta, i));
    if (!tendencia.has(clave)) tendencia.set(clave, { creados: 0, resueltos: 0 });
  }

  const porTipo = new Map<number, { nombre: string; total: number }>();
  const porEmpresa = new Map<number, { nombre: string; total: number }>();
  const porTecnico = new Map<number, { nombre: string; total: number }>();
  const resolucion = new Map<number, { nombre: string; horas: number; resueltos: number }>();

  for (const f of filas) {
    if (f.creado_at >= inicio) {
      const punto = tendencia.get(intervalo(diaLocal(f.creado_at)));
      if (punto) punto.creados++;
      contar(porTipo, f.tipo_id, f.tipo);
      contar(porEmpresa, f.empresa_id, f.empresa);
    }
    if (f.estatus === ESTATUS.COMPLETADO && f.cerrado_at && f.cerrado_at >= inicio) {
      const punto = tendencia.get(intervalo(diaLocal(f.cerrado_at)));
      if (punto) punto.resueltos++;
      if (f.c_id !== null) contar(porTecnico, f.c_id, nombreVisible({ nombre: f.c_nombre, username: f.c_username! }));
      const r = resolucion.get(f.tipo_id) ?? { nombre: f.tipo, horas: 0, resueltos: 0 };
      r.horas += (f.cerrado_at.getTime() - f.creado_at.getTime()) / HORA;
      r.resueltos++;
      resolucion.set(f.tipo_id, r);
    }
  }

  const empresas = ordenar([...porEmpresa].map(([id, x]) => ({ id: id as number | null, ...x })));
  if (empresas.length > MAX_EMPRESAS) {
    const resto = empresas.splice(MAX_EMPRESAS - 1);
    empresas.push({ id: null, nombre: 'Otras', total: resto.reduce((s, x) => s + x.total, 0) });
  }

  return {
    dias,
    desde,
    hasta,
    agrupacion,
    tendencia: [...tendencia].map(([fecha, x]) => ({ fecha, ...x })),
    porTipo: ordenar([...porTipo].map(([id, x]) => ({ id, ...x }))),
    porEmpresa: empresas,
    resueltosPorTecnico: ordenar([...porTecnico].map(([id, x]) => ({ id, ...x }))),
    horasResolucionPorTipo: [...resolucion]
      .map(([id, x]) => ({ id, nombre: x.nombre, horas: Math.round((x.horas / x.resueltos) * 10) / 10, resueltos: x.resueltos }))
      .sort((a, b) => b.horas - a.horas),
    generadoAt: ahora.toISOString(),
  };
}

// ============================================================== Exportación (Power BI / Excel)

const fechaHora = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.APP_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
/** "2026-10-01 16:53:07" en la zona del sistema: Power BI lo reconoce como fecha y hora. */
const fh = (d: Date | null) => (d ? fechaHora.format(d).replace(', ', ' ') : '');
const horas = (a: Date | null, b: Date | null) => (a && b ? ((b.getTime() - a.getTime()) / HORA).toFixed(2) : '');

/** Campo CSV: entre comillas si hace falta; evita que Excel interprete =,+,-,@ como fórmula. */
function campo(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const COLUMNAS_EXPORTACION = [
  'Folio', 'Estatus', 'Urgencia', 'Nivel urgencia', 'Tipo', 'Departamento', 'Empresa', 'Modulo', 'Concepto',
  'Solicitante', 'Asignado a', 'Cerrado por', 'Creado', 'Fecha creado', 'Tomado', 'Primera respuesta', 'Cerrado',
  'Horas a primera respuesta', 'Horas a cierre', 'Abierto',
] as const;

/**
 * Una fila por ticket (tabla plana: es lo que Power BI importa directo con "Obtener datos → Texto/CSV").
 * UTF-8 con BOM para que Excel respete los acentos; separador coma; decimales con punto.
 * `dias` null = todos los tickets.
 */
export async function exportarTicketsCsv(dias: PeriodoPanel | null, ahora = new Date()): Promise<string> {
  let q = db
    .selectFrom('tickets as t')
    .innerJoin('tipos_solicitud as ti', 'ti.id', 't.tipo_id')
    .innerJoin('departamentos as dp', 'dp.id', 't.departamento_id')
    .innerJoin('empresas as e', 'e.id', 't.empresa_id')
    .leftJoin('modulos as m', 'm.id', 't.modulo_id')
    .innerJoin('usuarios as s', 's.id', 't.solicitante_id')
    .leftJoin('usuarios as a', 'a.id', 't.asignado_a_id')
    .leftJoin('usuarios as c', 'c.id', 't.cerrado_por_id')
    .select([
      't.folio', 't.estatus', 't.urgencia', 't.concepto', 't.creado_at', 't.tomado_at', 't.primera_respuesta_at', 't.cerrado_at',
      'ti.nombre as tipo', 'dp.nombre as departamento', 'e.nombre as empresa', 'm.nombre as modulo',
      's.username as s_username', 's.nombre as s_nombre',
      'a.username as a_username', 'a.nombre as a_nombre',
      'c.username as c_username', 'c.nombre as c_nombre',
    ])
    .orderBy('t.creado_at');
  if (dias) q = q.where('t.creado_at', '>=', inicioDiaLocal(haceDias(hoyLocal(ahora), dias - 1)));
  const filas = await q.execute();

  const persona = (username: string | null, nombre: string | null) => (username ? nombreVisible({ username, nombre }) : '');
  const lineas = [COLUMNAS_EXPORTACION.join(',')];
  for (const f of filas) {
    const info = INFO_ESTATUS[f.estatus as Estatus];
    lineas.push(
      [
        f.folio,
        info?.nombre ?? f.estatus,
        INFO_URGENCIA[f.urgencia].nombre,
        INFO_URGENCIA[f.urgencia].nivel,
        f.tipo,
        f.departamento,
        f.empresa,
        f.modulo,
        f.concepto,
        persona(f.s_username, f.s_nombre),
        persona(f.a_username, f.a_nombre),
        persona(f.c_username, f.c_nombre),
        fh(f.creado_at),
        diaLocal(f.creado_at),
        fh(f.tomado_at),
        fh(f.primera_respuesta_at),
        fh(f.cerrado_at),
        horas(f.creado_at, f.primera_respuesta_at),
        horas(f.creado_at, f.cerrado_at),
        info?.esFinal ? 'No' : 'Si',
      ]
        .map(campo)
        .join(','),
    );
  }
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
