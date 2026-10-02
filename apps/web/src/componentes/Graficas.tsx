// Tarjeta de gráfica (título, descarga CSV y vista de tabla) y gráfica de tendencia (líneas en SVG).
// Reglas de visualización: un solo eje, trazos de 2 px, cuadrícula tenue, leyenda + etiqueta directa al
// final de cada línea (la identidad nunca va solo en color), cruz con detalle al pasar el cursor o con
// las flechas del teclado, y siempre una tabla equivalente.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { aCsv, descargarArchivo, type Celda } from '../lib/csv';
import { Icono } from './Icono';

export interface DatosTabla {
  columnas: string[];
  filas: Celda[][];
}

export function TarjetaGrafica({
  titulo,
  resumen,
  archivo,
  tabla,
  ancho,
  children,
}: {
  titulo: string;
  resumen?: string;
  /** Nombre del CSV sin extensión. */
  archivo: string;
  tabla: DatosTabla;
  ancho?: boolean;
  children: ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const id = useId();
  return (
    <section className={`panel grafica${ancho ? ' ancha' : ''}`} aria-labelledby={id}>
      <div className="panel-h">
        <div>
          <h2 id={id}>{titulo}</h2>
          {resumen && <p className="grafica-resumen">{resumen}</p>}
        </div>
        <div className="grafica-acciones">
          <button type="button" className="btn chico" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            <Icono n={verTabla ? 'chart' : 'list'} t="s" />
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
          <button
            type="button"
            className="btn chico"
            title="Descargar los datos de esta gráfica (CSV para Power BI o Excel)"
            disabled={!tabla.filas.length}
            onClick={() => descargarArchivo(`${archivo}.csv`, aCsv(tabla.columnas, tabla.filas))}
          >
            <Icono n="descargar" t="s" />
            CSV
          </button>
        </div>
      </div>
      {verTabla ? <TablaDatos tabla={tabla} /> : children}
    </section>
  );
}

function TablaDatos({ tabla }: { tabla: DatosTabla }) {
  return (
    <div className="tabla-caja grafica-tabla">
      <table className="tabla">
        <thead>
          <tr>
            {tabla.columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i}>
              {f.map((v, j) => (
                <td key={j} style={typeof v === 'number' ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : undefined}>
                  {typeof v === 'number' ? v.toLocaleString('es-MX') : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Tendencia

export interface SerieTendencia {
  clave: string;
  nombre: string;
  /** Variable CSS del color de la serie (p. ej. var(--serie-1)). */
  color: string;
  valores: number[];
}

const ALTO = 250;
const M = { arriba: 14, abajo: 28, izq: 38, der: 96 };

/** Máximo "redondo" del eje (1, 2, 5 × 10ⁿ) para que las marcas sean números limpios. */
function ejeY(max: number): { tope: number; paso: number } {
  if (max <= 0) return { tope: 4, paso: 1 };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto)!;
  const pasoEntero = Math.max(1, Math.ceil(paso));
  return { tope: Math.ceil(max / pasoEntero) * pasoEntero, paso: pasoEntero };
}

export type Agrupacion = 'dia' | 'semana' | 'mes';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...o, timeZone: 'UTC' });
const FORMATOS: Record<Agrupacion, [corto: Intl.DateTimeFormat, largo: Intl.DateTimeFormat, prefijo: string]> = {
  dia: [fmt({ day: 'numeric', month: 'short' }), fmt({ weekday: 'short', day: 'numeric', month: 'long' }), ''],
  semana: [fmt({ day: 'numeric', month: 'short' }), fmt({ day: 'numeric', month: 'long' }), 'Semana del '],
  mes: [fmt({ month: 'short', year: '2-digit' }), fmt({ month: 'long', year: 'numeric' }), ''],
};

export function GraficaTendencia({
  fechas,
  series,
  descripcion,
  agrupacion = 'dia',
}: {
  fechas: string[];
  series: SerieTendencia[];
  descripcion: string;
  agrupacion?: Agrupacion;
}) {
  const [fCorto, fLargo, prefijo] = FORMATOS[agrupacion];
  const dia = (f: string, largo = false) => (largo ? prefijo + fLargo.format(new Date(`${f}T00:00:00Z`)) : fCorto.format(new Date(`${f}T00:00:00Z`)));
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = fechas.length;
  const { tope, paso } = ejeY(Math.max(0, ...series.flatMap((s) => s.valores)));
  const anchoPlot = ancho - M.izq - M.der;
  const altoPlot = ALTO - M.arriba - M.abajo;
  const x = (i: number) => M.izq + (n <= 1 ? anchoPlot / 2 : (i / (n - 1)) * anchoPlot);
  const y = (v: number) => M.arriba + altoPlot - (v / tope) * altoPlot;

  const trazos = useMemo(
    () => series.map((s) => s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, ancho, tope],
  );

  // Marcas del eje X: ~6 fechas repartidas (siempre la primera y la última).
  const marcasX = useMemo(() => {
    const cuantas = Math.min(n, Math.max(2, Math.floor(anchoPlot / 110)));
    return [...new Set(Array.from({ length: cuantas }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, cuantas - 1))))];
  }, [n, anchoPlot]);

  // Etiquetas directas al final de cada línea, separadas si quedan encimadas.
  const finales = series
    .map((s) => ({ s, yy: y(s.valores[n - 1] ?? 0) }))
    .sort((a, b) => a.yy - b.yy)
    .map((e, i, arr) => (i && e.yy - arr[i - 1]!.yy < 16 ? { ...e, yy: arr[i - 1]!.yy + 16 } : e));

  const elegir = (clientX: number) => {
    const r = caja.current!.getBoundingClientRect();
    const rel = (clientX - r.left - M.izq) / anchoPlot;
    setActivo(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };

  const textoPunto = (i: number) => `${dia(fechas[i]!, true)}: ${series.map((s) => `${s.nombre} ${s.valores[i]}`).join(', ')}`;

  return (
    <div className="tendencia">
      <ul className="leyenda" aria-hidden="true">
        {series.map((s) => (
          <li key={s.clave}>
            <i style={{ background: s.color }} />
            {s.nombre}
          </li>
        ))}
      </ul>
      <div
        ref={caja}
        className="tendencia-caja"
        tabIndex={0}
        role="img"
        aria-label={`${descripcion}. ${activo !== null ? textoPunto(activo) : 'Usa las flechas para recorrer la gráfica.'}`}
        onMouseMove={(e) => elegir(e.clientX)}
        onMouseLeave={() => setActivo(null)}
        onBlur={() => setActivo(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            setActivo((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
          } else if (e.key === 'Home') setActivo(0);
          else if (e.key === 'End') setActivo(n - 1);
        }}
      >
        <svg width={ancho} height={ALTO} aria-hidden="true">
          {Array.from({ length: tope / paso + 1 }, (_, k) => k * paso).map((v) => (
            <g key={v}>
              <line className="rejilla" x1={M.izq} x2={M.izq + anchoPlot} y1={y(v)} y2={y(v)} />
              <text className="eje" x={M.izq - 8} y={y(v)} dy="0.32em" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {marcasX.map((i) => (
            <text key={i} className="eje" x={x(i)} y={ALTO - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {dia(fechas[i]!)}
            </text>
          ))}
          {series.map((s, k) => (
            <path key={s.clave} className="linea" d={trazos[k]} style={{ stroke: s.color }} />
          ))}
          {finales.map(({ s, yy }) => (
            <text key={s.clave} className="etiqueta-final" x={M.izq + anchoPlot + 8} y={yy} dy="0.32em">
              {s.nombre} {s.valores[n - 1]}
            </text>
          ))}
          {activo !== null && (
            <g>
              <line className="cruz" x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + altoPlot} />
              {series.map((s) => (
                <circle key={s.clave} className="punto" cx={x(activo)} cy={y(s.valores[activo]!)} r={4.5} style={{ fill: s.color }} />
              ))}
            </g>
          )}
        </svg>
        {activo !== null && (
          <div className="info-barra tendencia-info" style={{ left: Math.min(Math.max(x(activo) - 70, 0), ancho - 160), top: 0 }} aria-hidden="true">
            <b>{dia(fechas[activo]!, true)}</b>
            {series.map((s) => (
              <span key={s.clave}>
                <i style={{ background: s.color }} />
                {s.nombre}: {s.valores[activo]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
