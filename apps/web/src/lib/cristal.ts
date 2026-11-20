// Efectos del estilo Cristal (vidrio líquido). Solo actúan con <html data-estilo="cristal">.
// 1. Gota: en el menú lateral, los filtros y los selectores segmentados, la opción elegida se marca con una
//    "gota" de vidrio que se desliza a la nueva opción y se estira en el camino, como en iOS 26.
// 2. Reflejo: un brillo que sigue al puntero sobre las superficies de vidrio (--mx / --my).
// Sin animaciones (interruptor de Apariencia o "reducir movimiento") la gota cambia de lugar sin moverse.
import { menosMovimiento } from './movimiento';

const CONTENEDORES = '.side nav, .seg, .filters';
const ELEGIDO =
  ':scope > [aria-current="page"], :scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-checked="true"]';
const CON_REFLEJO =
  '.panel, .tarjeta, .col, .modal, .side, .btn, .icon-btn, .filters button, .tk, .kc, .notif-panel, .login form';
const RESORTE =
  'linear(0, 0.013 0.6%, 0.05 1.2%, 0.2 2.6%, 0.43 4.4%, 0.74 6.9%, 0.97 9.4%, 1.1 11.7%, 1.16 13.7%, 1.17 15.3%, 1.15 17.5%, 1.03 23.6%, 0.99 27%, 0.98 30.6%, 1.002 41.7%, 1)';

const activo = () => document.documentElement.getAttribute('data-estilo') === 'cristal';
const animar = () => document.documentElement.getAttribute('data-animaciones') !== 'no' && !menosMovimiento();

interface Lugar {
  x: number;
  y: number;
  w: number;
  h: number;
}
const ultimo = new WeakMap<HTMLElement, Lugar>();

// Medidas de diseño (offset*), no de pantalla: no cambian mientras una ventana o la página se anima con escala.
function lugarDe(_cont: HTMLElement, el: HTMLElement): Lugar {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

function colocarGota(cont: HTMLElement) {
  let gota = cont.querySelector<HTMLElement>(':scope > .gota');
  const elegido = cont.querySelector<HTMLElement>(ELEGIDO);
  if (!activo() || !elegido) {
    gota?.remove();
    cont.classList.remove('con-gota');
    ultimo.delete(cont);
    return;
  }
  if (!gota) {
    gota = document.createElement('span');
    gota.className = 'gota';
    gota.setAttribute('aria-hidden', 'true');
    gota.innerHTML = '<span class="gota-in"></span>';
    cont.prepend(gota);
    cont.classList.add('con-gota');
  }
  const nuevo = lugarDe(cont, elegido);
  const antes = ultimo.get(cont);
  ultimo.set(cont, nuevo);
  const destino = `translate(${nuevo.x}px, ${nuevo.y}px)`;
  Object.assign(gota.style, { width: `${nuevo.w}px`, height: `${nuevo.h}px`, transform: destino });
  if (!antes || (antes.x === nuevo.x && antes.y === nuevo.y && antes.w === nuevo.w) || !animar()) return;

  // Se desliza con resorte desde el lugar anterior y, en el camino, se estira en la dirección del movimiento.
  const dist = Math.hypot(nuevo.x - antes.x, nuevo.y - antes.y);
  if (dist < 1) return;
  gota.animate(
    [
      { transform: `translate(${antes.x}px, ${antes.y}px)`, width: `${antes.w}px`, height: `${antes.h}px` },
      { transform: destino, width: `${nuevo.w}px`, height: `${nuevo.h}px` },
    ],
    { duration: 560, easing: RESORTE },
  );
  const horizontal = Math.abs(nuevo.x - antes.x) > Math.abs(nuevo.y - antes.y);
  const estira = Math.min(0.28, dist / 600);
  gota.firstElementChild?.animate(
    [
      { transform: 'scale(1, 1)' },
      {
        transform: horizontal
          ? `scale(${1 + estira}, ${1 - estira * 0.6})`
          : `scale(${1 - estira * 0.5}, ${1 + estira})`,
        offset: 0.35,
      },
      { transform: 'scale(1, 1)' },
    ],
    { duration: 620, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' },
  );
}

let pendiente = 0;
function actualizar() {
  if (pendiente) return;
  pendiente = requestAnimationFrame(() => {
    pendiente = 0;
    document.querySelectorAll<HTMLElement>(CONTENEDORES).forEach(colocarGota);
  });
}

// ---------------------------------------------------------------- reflejo que sigue al puntero
let bajoPuntero: HTMLElement | null = null;
let px = 0;
let py = 0;
let reflejoPendiente = 0;
function moverReflejo() {
  reflejoPendiente = 0;
  const el =
    (document.elementFromPoint(px, py) as HTMLElement | null)?.closest<HTMLElement>(CON_REFLEJO) ?? null;
  if (el !== bajoPuntero) {
    bajoPuntero?.style.removeProperty('--mx');
    bajoPuntero?.style.removeProperty('--my');
    bajoPuntero = el;
  }
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${px - r.left}px`);
  el.style.setProperty('--my', `${py - r.top}px`);
}

// ---------------------------------------------------------------- lente: refracción en los bordes
// Mapa de desplazamiento: en el centro no mueve nada (gris medio) y en los bordes empuja hacia dentro,
// como el canto de una lente. Chrome y Edge lo aplican en backdrop-filter; los demás lo ignoran.
function montarLente() {
  if (document.getElementById('cristal-svg')) return;
  const mapa =
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' preserveAspectRatio='none' viewBox='0 0 200 200'>` +
        `<defs><linearGradient id='r' x1='0' x2='1'><stop offset='0' stop-color='#000'/><stop offset='.18' stop-color='#800000'/><stop offset='.82' stop-color='#800000'/><stop offset='1' stop-color='#f00'/></linearGradient>` +
        `<linearGradient id='g' y1='0' y2='1' x1='0' x2='0'><stop offset='0' stop-color='#000'/><stop offset='.22' stop-color='#008000'/><stop offset='.78' stop-color='#008000'/><stop offset='1' stop-color='#0f0'/></linearGradient></defs>` +
        `<rect width='200' height='200' fill='url(#r)'/><rect width='200' height='200' fill='url(#g)' style='mix-blend-mode:screen'/></svg>`,
    );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'cristal-svg';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  svg.innerHTML =
    `<filter id="cristal-lente" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feImage href="${mapa}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="mapa"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="mapa" scale="18" xChannelSelector="R" yChannelSelector="G"/>` +
    `</filter>`;
  document.body.append(svg);
  // Solo navegadores Chromium aplican filtros SVG en backdrop-filter.
  const chromium = /Chrome\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent);
  document.documentElement.toggleAttribute('data-lente', chromium);
}

export function iniciarCristal(): void {
  montarLente();
  new MutationObserver(actualizar).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'aria-current',
      'aria-pressed',
      'aria-selected',
      'aria-checked',
      'data-estilo',
      'class',
    ],
  });
  addEventListener('resize', actualizar, { passive: true });
  // El menú lateral cambia de ancho con transición al contraerse: se vuelve a medir al terminar.
  document.addEventListener('transitionend', actualizar, { passive: true });
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!activo() || e.pointerType !== 'mouse') return;
      px = e.clientX;
      py = e.clientY;
      if (!reflejoPendiente) reflejoPendiente = requestAnimationFrame(moverReflejo);
    },
    { passive: true },
  );
  actualizar();
}
