// Aplica el modo claro/oscuro y la paleta del usuario a toda la página (atributos en <html>; los colores
// viven en estilos/app.css). La elección se guarda en el servidor por usuario y se copia en este navegador
// para aplicarla antes de dibujar la página (sin destello de otro color al cargar).
import { acentoVisible, APARIENCIA_INICIAL, leerApariencia, type Acento, type Apariencia } from '@mesa/shared';
import { menosMovimiento } from './movimiento';

const CLAVE = 'mesa.apariencia';

/** Color de la barra del navegador y de la ventana de la app instalada, por paleta. */
const COLOR_BARRA: Record<Acento, string> = {
  aqua: '#028183',
  oceano: '#2271cc',
  bosque: '#1f8a4a',
  ambar: '#c47500',
  ciruela: '#7c4bd0',
  coral: '#c4403a',
  grafito: '#5f6f79',
  rosa: '#c42f7c',
  vino: '#7a1533',
  muertos: '#4a1f73',
  navidad: '#1d5c3c',
  patrias: '#8a1424',
  sanvalentin: '#6e0f2e',
};

export function aparienciaGuardada(): Apariencia {
  try {
    return leerApariencia(JSON.parse(localStorage.getItem(CLAVE) ?? 'null'));
  } catch {
    return APARIENCIA_INICIAL;
  }
}

export function aplicarApariencia(a: Apariencia): void {
  const raiz = document.documentElement;
  // "sistema" quita el atributo: manda la preferencia de Windows/Android (prefers-color-scheme).
  if (a.tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', a.tema === 'oscuro' ? 'dark' : 'light');
  // En temporada, quien usa Aqua ve la paleta de temporada (si no la apagó en Apariencia).
  const acento = acentoVisible(a);
  if (acento === 'aqua') raiz.removeAttribute('data-acento');
  else raiz.setAttribute('data-acento', acento);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[acento]);
  // Animaciones decorativas apagadas por el usuario (el CSS también respeta "reducir movimiento").
  if (a.animaciones) raiz.removeAttribute('data-animaciones');
  else raiz.setAttribute('data-animaciones', 'no');
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: se aplica igual, solo no se recuerda en este navegador */
  }
}

/**
 * Cambia el tema con un círculo que se expande desde `origen` (donde se hizo clic) usando View Transitions.
 * Sin soporte del navegador, con "reducir movimiento" o con las animaciones apagadas, cambia al instante.
 */
export function transicionTema(cambiar: () => void, a: Apariencia, origen?: { x: number; y: number }): void {
  if (!('startViewTransition' in document) || !a.animaciones || menosMovimiento()) return cambiar();
  const raiz = document.documentElement;
  const x = origen?.x ?? innerWidth / 2;
  const y = origen?.y ?? innerHeight / 2;
  const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  // Marca la transición como de tema: así no se activa la animación de cambio de página (.main).
  raiz.dataset.transicion = 'tema';
  const t = document.startViewTransition(cambiar);
  t.ready
    .then(() =>
      raiz.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => undefined);
  void t.finished.finally(() => delete raiz.dataset.transicion);
}
