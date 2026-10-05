// Ilustraciones de las pantallas vacías. Son SVG en línea con los colores de la paleta del usuario
// (variables CSS), así cambian con el modo claro/oscuro y con cada paleta, incluidas las de temporada.
import { useId, type ReactNode } from 'react';

export type Dibujo =
  'buzon' | 'lupa' | 'grafica' | 'candado' | 'nube' | 'sobre' | 'personas' | 'globo' | 'senal' | 'tarjetas';

const brillo = (x: number, y: number, r = 5) => (
  <path className="d-brillo" d={`M${x} ${y - r}v${r * 2}M${x - r} ${y}h${r * 2}`} />
);

/** Cada dibujo recibe el relleno de acento (degradado de la paleta) ya resuelto. */
const DIBUJOS: Record<Dibujo, (acento: string) => ReactNode> = {
  buzon: (a) => (
    <>
      <path className="d-hoja" d="M44 70l12-18h48l12 18v22a4 4 0 01-4 4H48a4 4 0 01-4-4z" />
      <path className="d-linea" d="M44 70h22a14 8 0 0028 0h22" />
      <path className="d-vacia" d="M66 42c10-10 22-8 36-15" />
      <g className="flota">
        <path fill={a} d="M104 26l28-12-12 26-6-10z" />
        <path className="d-linea" d="M114 30l18-16" />
      </g>
      {brillo(40, 40)}
    </>
  ),
  lupa: () => (
    <>
      <rect className="d-hoja" x="46" y="28" width="50" height="62" rx="6" />
      <path className="d-renglon" d="M56 44h30M56 54h22M56 64h26" />
      <g className="flota">
        <circle className="d-hoja" cx="104" cy="70" r="17" />
        <path className="d-mango" d="M117 83l13 13" />
      </g>
      {brillo(126, 38)}
      {brillo(36, 80, 4)}
    </>
  ),
  grafica: (a) => (
    <>
      <path className="d-linea" d="M44 94h76M44 94V34" />
      <rect className="d-vacia" x="54" y="70" width="12" height="22" rx="2" />
      <rect className="d-vacia" x="74" y="56" width="12" height="36" rx="2" />
      <rect className="d-vacia" x="94" y="76" width="12" height="16" rx="2" />
      <circle className="flota" fill={a} cx="118" cy="36" r="8" />
      {brillo(132, 58, 4)}
    </>
  ),
  candado: (a) => (
    <>
      <path className="d-linea grueso" d="M64 58V46a16 16 0 0132 0v12" />
      <rect fill={a} x="54" y="56" width="52" height="40" rx="8" />
      <circle className="d-hueco" cx="80" cy="72" r="5" />
      <rect className="d-hueco" x="78" y="74" width="4" height="10" rx="2" />
      {brillo(40, 44)}
      {brillo(122, 36, 4)}
    </>
  ),
  nube: (a) => (
    <>
      <path className="d-hoja" d="M54 84a16 16 0 013-31 22 22 0 0142-7 18 18 0 0111 38z" />
      <path
        className="flota"
        fill="none"
        stroke={a}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M86 54l-8 14h10l-8 14"
      />
      <path className="d-vacia" d="M48 100h20M92 100h20" />
    </>
  ),
  sobre: (a) => (
    <>
      <rect className="d-hoja" x="46" y="44" width="68" height="48" rx="6" />
      <path className="d-linea" d="M46 50l34 24 34-24" />
      <g className="flota">
        <circle fill={a} cx="114" cy="44" r="11" />
        <path className="d-hueco-linea" d="M109 44l4 4 7-8" />
      </g>
      {brillo(36, 56, 4)}
    </>
  ),
  personas: (a) => (
    <>
      <circle className="d-hoja" cx="70" cy="50" r="12" />
      <path className="d-hoja" d="M48 92a22 20 0 0144 0z" />
      <g className="flota">
        <circle fill={a} cx="98" cy="58" r="10" />
        <path fill={a} d="M82 94a16 15 0 0132 0z" />
      </g>
      {brillo(122, 38, 4)}
    </>
  ),
  globo: (a) => (
    <>
      <path
        className="d-hoja"
        d="M48 34h62a8 8 0 018 8v32a8 8 0 01-8 8H76l-14 12V82H48a8 8 0 01-8-8V42a8 8 0 018-8z"
      />
      <path className="d-renglon" d="M54 50h44M54 60h32M54 70h38" />
      <g className="flota">
        <circle fill={a} cx="118" cy="34" r="10" />
        <path className="d-hueco-linea" d="M118 29v10M113 34h10" />
      </g>
    </>
  ),
  senal: (a) => (
    <>
      <path className="d-linea grueso" d="M80 38v58" />
      <path fill={a} d="M56 42h44l8 8-8 8H56z" />
      <path className="d-hoja" d="M104 64H62l-8 8 8 8h42z" />
      <path className="d-vacia" d="M38 100c14-6 26-6 40 0" />
      {brillo(124, 36)}
    </>
  ),
  tarjetas: (a) => (
    <>
      <rect
        className="d-hoja tenue"
        x="46"
        y="36"
        width="58"
        height="40"
        rx="6"
        transform="rotate(-6 75 56)"
      />
      <rect className="d-hoja" x="56" y="46" width="58" height="40" rx="6" />
      <path className="d-renglon" d="M66 60h34M66 70h22" />
      <path
        className="flota"
        fill={a}
        stroke="var(--surface)"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M108 76v24l6-6 5 10 5-2-5-10h8z"
      />
    </>
  ),
};

export function Ilustracion({ dibujo }: { dibujo: Dibujo }) {
  const id = useId();
  return (
    <svg className="dibujo" viewBox="0 0 160 120" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--marca-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--marca-3)' }} />
        </linearGradient>
      </defs>
      <ellipse className="d-fondo" cx="80" cy="64" rx="64" ry="48" />
      <ellipse className="d-sombra" cx="80" cy="108" rx="42" ry="4" />
      {DIBUJOS[dibujo](`url(#${id})`)}
    </svg>
  );
}
