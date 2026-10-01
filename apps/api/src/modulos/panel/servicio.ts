// Resumen del dashboard de administración. Consultas agregadas solo sobre `tickets` (usan índices).
import { sql } from 'kysely';
import { ESTATUS, URGENCIAS_DESC, type PanelResumen, type Urgencia } from '@mesa/shared';
import { db } from '../../db/conexion';
import { inicioDiaLocal, hoyLocal, lunesLocal } from '../../lib/fechas';

const FINALES = [ESTATUS.COMPLETADO, ESTATUS.NO_PROCEDE];

export async function resumenPanel(ahora = new Date()): Promise<PanelResumen> {
  const inicioHoy = inicioDiaLocal(hoyLocal(ahora));
  const inicioSemana = inicioDiaLocal(lunesLocal(ahora));

  const [porEstatus, cerrados, sinAtender, porDepartamento, porUrgencia] = await Promise.all([
    db.selectFrom('tickets').select(['estatus', sql<number>`COUNT(*)`.as('n')]).groupBy('estatus').execute(),
    db
      .selectFrom('tickets')
      .select([
        sql<number>`SUM(cerrado_at >= ${inicioHoy})`.as('hoy'),
        sql<number>`SUM(cerrado_at >= ${inicioSemana})`.as('semana'),
      ])
      .where('estatus', '=', ESTATUS.COMPLETADO)
      .where('cerrado_at', '>=', inicioSemana < inicioHoy ? inicioSemana : inicioHoy)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('tickets')
      .select(['urgencia', sql<number>`COUNT(*)`.as('n')])
      .where('estatus', '=', ESTATUS.PENDIENTE)
      .where('urgencia', 'in', ['CRITICA', 'ALTA'])
      .groupBy('urgencia')
      .execute(),
    db
      .selectFrom('departamentos as d')
      .leftJoin('tickets as t', (j) => j.onRef('t.departamento_id', '=', 'd.id').on('t.estatus', 'not in', FINALES))
      .select(['d.id', 'd.nombre', 'd.codigo', sql<number>`COUNT(t.id)`.as('n')])
      .where((eb) => eb.or([eb('d.activo', '=', 1), eb('t.id', 'is not', null)]))
      .groupBy(['d.id', 'd.nombre', 'd.codigo'])
      .orderBy(sql`COUNT(t.id)`, 'desc')
      .orderBy('d.nombre')
      .execute(),
    db
      .selectFrom('tickets')
      .select(['urgencia', sql<number>`COUNT(*)`.as('n')])
      .where('estatus', 'not in', FINALES)
      .groupBy('urgencia')
      .execute(),
  ]);

  const n = (e: string) => Number(porEstatus.find((x) => x.estatus === e)?.n ?? 0);
  const urg = new Map(porUrgencia.map((x) => [x.urgencia as Urgencia, Number(x.n)]));
  return {
    abiertos: n(ESTATUS.PENDIENTE) + n(ESTATUS.EN_PROCESO) + n(ESTATUS.PAUSADO),
    pendientes: n(ESTATUS.PENDIENTE),
    enProceso: n(ESTATUS.EN_PROCESO),
    pausados: n(ESTATUS.PAUSADO),
    cerradosHoy: Number(cerrados.hoy ?? 0),
    cerradosSemana: Number(cerrados.semana ?? 0),
    criticosSinAtender: Number(sinAtender.find((x) => x.urgencia === 'CRITICA')?.n ?? 0),
    altosSinAtender: Number(sinAtender.find((x) => x.urgencia === 'ALTA')?.n ?? 0),
    abiertosPorDepartamento: porDepartamento.map((d) => ({ id: d.id, nombre: d.nombre, codigo: d.codigo, total: Number(d.n) })),
    // Siempre las cuatro urgencias, de crítica a baja (también las que están en cero).
    abiertosPorUrgencia: URGENCIAS_DESC.map((u) => ({ urgencia: u, total: urg.get(u) ?? 0 })),
    generadoAt: ahora.toISOString(),
  };
}
