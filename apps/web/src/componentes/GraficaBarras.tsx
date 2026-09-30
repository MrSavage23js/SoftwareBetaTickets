// Barras horizontales en HTML (sin librería): una fila por categoría, valor en la punta,
// detalle al pasar el cursor o con el teclado, y clic para filtrar. Eje en cero, barras <= 24px,
// extremo redondeado de 4px y cuadrado en la base. El texto usa tinta, nunca el color de la barra.
import { useRef, useState, type ReactNode } from 'react';

export interface DatoBarra {
  clave: string;
  etiqueta: string;
  valor: number;
  color: string;
  /** Marca a la izquierda de la etiqueta (p. ej. el nivel de urgencia): la identidad nunca va solo en color. */
  marca?: ReactNode;
}

export function GraficaBarras({
  datos,
  unidad,
  alElegir,
  descripcion,
}: {
  datos: DatoBarra[];
  unidad: [singular: string, plural: string];
  alElegir?: (clave: string) => void;
  descripcion: string;
}) {
  const [info, setInfo] = useState<{ texto: string; x: number; y: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const texto = (d: DatoBarra) =>
    `${d.etiqueta}: ${d.valor.toLocaleString('es-MX')} ${d.valor === 1 ? unidad[0] : unidad[1]}${total ? ` (${Math.round((d.valor / total) * 100)} %)` : ''}`;

  const mostrar = (d: DatoBarra, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const c = caja.current!.getBoundingClientRect();
    const arriba = r.top - c.top - 40;
    setInfo({ texto: texto(d), x: r.left - c.left + Math.min(r.width * 0.3, 160), y: arriba >= 4 ? arriba : r.bottom - c.top + 6 });
  };

  return (
    <div className="barras" ref={caja} role="list" aria-label={descripcion} onMouseLeave={() => setInfo(null)}>
      {datos.map((d) => (
        <button
          key={d.clave}
          type="button"
          role="listitem"
          className="barra"
          aria-label={texto(d) + (alElegir ? '. Clic para filtrar la tabla.' : '')}
          onMouseEnter={(e) => mostrar(d, e.currentTarget)}
          onFocus={(e) => mostrar(d, e.currentTarget)}
          onBlur={() => setInfo(null)}
          onClick={() => alElegir?.(d.clave)}
          disabled={!alElegir}
          style={{ cursor: alElegir ? 'pointer' : 'default', opacity: 1 }}
        >
          <span className="etq">
            {d.marca}
            {d.etiqueta}
          </span>
          <span className="pista">
            <span className="relleno" style={{ width: `${(d.valor / max) * 85}%`, background: d.color }} />
            <span className="valor">{d.valor.toLocaleString('es-MX')}</span>
          </span>
        </button>
      ))}
      {info && (
        <div className="info-barra" style={{ left: info.x, top: info.y }} aria-hidden="true">
          {info.texto}
        </div>
      )}
    </div>
  );
}
