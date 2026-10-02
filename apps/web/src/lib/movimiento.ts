// Movimiento de la interfaz. Reglas: solo se anima transform y opacity (no provoca recálculo de
// diseño en cada cuadro), duraciones cortas y todo se apaga con "reducir movimiento" del sistema.
import { useLayoutEffect, useRef, type RefObject } from 'react';

const CURVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function menosMovimiento(): boolean {
  return typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Caja {
  x: number;
  y: number;
}

// Últimas posiciones conocidas por raíz. Una tarjeta que cambia de columna en el Kanban se busca por
// su id en la misma raíz (el tablero), así que se desliza de una columna a otra.
const posiciones = new WeakMap<Element, Map<string, Caja>>();

/**
 * Reacomodo FLIP: cuando cambia `clave` (p. ej. la lista de ids), cada elemento `[data-flip="id"]`
 * dentro de `ref` se desliza desde su posición anterior a la nueva; los que aparecen entran con un
 * desvanecido. Las posiciones se miden contra el ancestro `[data-flip-raiz]` (o el propio contenedor),
 * así ni el desplazamiento de la página ni el de la raíz las alteran.
 */
export function useReacomodo(ref: RefObject<HTMLElement | null>, clave: string) {
  const primera = useRef(true);
  useLayoutEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const raiz = cont.closest('[data-flip-raiz]') ?? cont;
    let mapa = posiciones.get(raiz);
    if (!mapa) posiciones.set(raiz, (mapa = new Map()));
    const animar = !primera.current && !menosMovimiento();
    primera.current = false;

    // 1) Leer todas las posiciones primero (una sola pasada de diseño) …
    // Se suma el desplazamiento interno de la raíz (Kanban horizontal, lista con scroll propio).
    const base = raiz.getBoundingClientRect();
    const ox = raiz.scrollLeft - base.left;
    const oy = raiz.scrollTop - base.top;
    const elementos = [...cont.querySelectorAll<HTMLElement>('[data-flip]')];
    const nuevas = elementos.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, id: el.dataset.flip!, x: r.left + ox, y: r.top + oy };
    });
    // 2) … y después escribir (animaciones), sin intercalar lecturas.
    for (const n of nuevas) {
      const antes = mapa.get(n.id);
      if (animar) {
        if (antes) {
          const dx = antes.x - n.x;
          const dy = antes.y - n.y;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            n.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: CURVA });
          }
        } else {
          n.el.animate(
            [
              { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 220, easing: CURVA },
          );
        }
      }
      mapa.set(n.id, { x: n.x, y: n.y });
    }
  }, [ref, clave]);
}
