// Aplica el modo claro/oscuro y la paleta del usuario a toda la página (atributos en <html>; los colores
// viven en estilos/app.css). La elección se guarda en el servidor por usuario y se copia en este navegador
// para aplicarla antes de dibujar la página (sin destello de otro color al cargar).
import { APARIENCIA_INICIAL, leerApariencia, type Acento, type Apariencia } from '@mesa/shared';

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
  if (a.acento === 'aqua') raiz.removeAttribute('data-acento');
  else raiz.setAttribute('data-acento', a.acento);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[a.acento]);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: se aplica igual, solo no se recuerda en este navegador */
  }
}
