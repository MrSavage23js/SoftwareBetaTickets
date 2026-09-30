// Urgencia: color de la especificación + nombre + indicador de nivel (1 a 4 barras).
// El color nunca va solo (naranja/rojo se parecen; verde/amarillo se confunden con daltonismo)
// y el texto va en tinta, no en el color (el amarillo no se lee sobre blanco).
import { INFO_URGENCIA, URGENCIAS, type Urgencia } from '@mesa/shared';

export function Nivel({ urgencia }: { urgencia: Urgencia }) {
  const { nivel, color } = INFO_URGENCIA[urgencia];
  return (
    <span className="urg-nivel" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} style={i <= nivel ? { background: color } : undefined} />
      ))}
    </span>
  );
}

export function BadgeUrgencia({ urgencia, compacto }: { urgencia: Urgencia; compacto?: boolean }) {
  const i = INFO_URGENCIA[urgencia];
  return (
    <span className={`urg ${compacto ? 'compacto' : ''}`} title={`Urgencia ${i.nombre.toLowerCase()}`}>
      <Nivel urgencia={urgencia} />
      {compacto ? <span className="sr">Urgencia </span> : null}
      {i.nombre}
    </span>
  );
}

/** Selector obligatorio al crear el ticket (por omisión, "media"). */
export function SelectorUrgencia({ valor, alCambiar }: { valor: Urgencia; alCambiar: (u: Urgencia) => void }) {
  return (
    <div className="urg-selector" role="radiogroup" aria-label="Urgencia">
      {URGENCIAS.map((u) => (
        <label key={u} className={valor === u ? 'activo' : ''}>
          <input type="radio" name="urgencia" value={u} checked={valor === u} onChange={() => alCambiar(u)} />
          <Nivel urgencia={u} />
          {INFO_URGENCIA[u].nombre}
        </label>
      ))}
    </div>
  );
}

/** Franja de color a la izquierda de filas y tarjetas (acompaña al distintivo con texto). */
export const franja = (urgencia: Urgencia) => ({ boxShadow: `inset 4px 0 0 ${INFO_URGENCIA[urgencia].color}` });
