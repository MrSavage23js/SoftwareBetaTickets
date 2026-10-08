// Ambiente animado del fondo: pocas partículas detrás del contenido, según la paleta visible (las de temporada
// también): cempasúchil, nieve, confeti y corazones; burbujas, hojas, luciérnagas, estrellas… en las normales.
// Un solo <canvas> fijo detrás de todo (z-index -1: entre el fondo de la página y el contenido), sin eventos
// del ratón. Se detiene con "reducir movimiento", con el interruptor Animaciones (html[data-animaciones='no'])
// y mientras la pestaña está oculta. Lee la paleta y el modo del <html> (los pone lib/apariencia.ts).
import { useEffect, useRef } from 'react';
import type { Acento } from '@mesa/shared';
import { menosMovimiento } from '../lib/movimiento';

type Movimiento = 'cae' | 'sube' | 'flota' | 'titila';

interface Particula {
  x: number;
  y: number;
  tam: number;
  vx: number;
  vy: number;
  giro: number;
  vgiro: number;
  fase: number;
  color: string;
  forma: number;
}

interface Efecto {
  movimiento: Movimiento;
  /** Partículas por cada 100 000 px² de pantalla (se limita a un máximo). */
  densidad: number;
  tam: [number, number];
  velocidad: [number, number];
  colores: (oscuro: boolean, marca: string[]) => string[];
  dibujar: (c: CanvasRenderingContext2D, p: Particula, alfa: number) => void;
}

// ---------------------------------------------------------------- Formas
function flor(c: CanvasRenderingContext2D, p: Particula) {
  // Cempasúchil: corona de pétalos redondos y centro más oscuro.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(a) * p.tam * 0.55, Math.sin(a) * p.tam * 0.55, p.tam * 0.42, 0, Math.PI * 2);
    c.fillStyle = p.color;
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, p.tam * 0.38, 0, Math.PI * 2);
  c.fillStyle = '#d9480f';
  c.fill();
}

function petalo(c: CanvasRenderingContext2D, p: Particula) {
  c.beginPath();
  c.ellipse(0, 0, p.tam * 0.45, p.tam, 0, 0, Math.PI * 2);
  c.fillStyle = p.color;
  c.fill();
}

function corazon(c: CanvasRenderingContext2D, p: Particula) {
  const s = p.tam / 10;
  c.beginPath();
  c.moveTo(0, 3 * s);
  c.bezierCurveTo(-7 * s, -2 * s, -4 * s, -8 * s, 0, -4 * s);
  c.bezierCurveTo(4 * s, -8 * s, 7 * s, -2 * s, 0, 3 * s);
  c.fillStyle = p.color;
  c.fill();
}

function confeti(c: CanvasRenderingContext2D, p: Particula) {
  c.fillStyle = p.color;
  // El giro en Y se simula achatando el papel según su fase.
  c.scale(Math.cos(p.fase), 1);
  if (p.forma < 0.5) c.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
  else {
    c.beginPath();
    c.arc(0, 0, p.tam / 3, 0, Math.PI * 2);
    c.fill();
  }
}

function hoja(c: CanvasRenderingContext2D, p: Particula) {
  c.beginPath();
  c.moveTo(0, -p.tam);
  c.quadraticCurveTo(p.tam * 0.8, 0, 0, p.tam);
  c.quadraticCurveTo(-p.tam * 0.8, 0, 0, -p.tam);
  c.fillStyle = p.color;
  c.fill();
}

function burbuja(c: CanvasRenderingContext2D, p: Particula) {
  c.beginPath();
  c.arc(0, 0, p.tam, 0, Math.PI * 2);
  c.strokeStyle = p.color;
  c.lineWidth = Math.max(1, p.tam / 6);
  c.stroke();
  c.beginPath();
  c.arc(-p.tam * 0.35, -p.tam * 0.35, p.tam * 0.22, 0, Math.PI * 2);
  c.fillStyle = p.color;
  c.fill();
}

function luz(c: CanvasRenderingContext2D, p: Particula) {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, p.tam * 2.5);
  g.addColorStop(0, p.color);
  g.addColorStop(1, 'transparent');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, p.tam * 2.5, 0, Math.PI * 2);
  c.fill();
}

function estrella(c: CanvasRenderingContext2D, p: Particula) {
  const t = p.tam;
  c.beginPath();
  c.moveTo(0, -t);
  c.quadraticCurveTo(0, 0, t, 0);
  c.quadraticCurveTo(0, 0, 0, t);
  c.quadraticCurveTo(0, 0, -t, 0);
  c.quadraticCurveTo(0, 0, 0, -t);
  c.fillStyle = p.color;
  c.fill();
}

function punto(c: CanvasRenderingContext2D, p: Particula) {
  c.beginPath();
  c.arc(0, 0, p.tam, 0, Math.PI * 2);
  c.fillStyle = p.color;
  c.fill();
}

const conAlfa = (dibujo: (c: CanvasRenderingContext2D, p: Particula) => void) => (c: CanvasRenderingContext2D, p: Particula, alfa: number) => {
  c.globalAlpha = alfa;
  dibujo(c, p);
};

// ---------------------------------------------------------------- Efectos por paleta
const NIEVE_CLARO = ['#a9c7da', '#bcd5e5', '#cfe1ec'];
const EFECTOS: Record<Acento, Efecto> = {
  muertos: { movimiento: 'cae', densidad: 1.6, tam: [5, 9], velocidad: [0.35, 0.8], colores: () => ['#ffb627', '#ff9f1c', '#ffc94d'], dibujar: conAlfa(flor) },
  navidad: { movimiento: 'cae', densidad: 3.2, tam: [1.6, 4], velocidad: [0.25, 0.7], colores: (o) => (o ? ['#ffffff', '#e8f1f8'] : NIEVE_CLARO), dibujar: conAlfa(punto) },
  patrias: {
    movimiento: 'cae',
    densidad: 2.4,
    tam: [6, 10],
    velocidad: [0.5, 1],
    colores: (o) => ['#1f9d55', '#e2323f', o ? '#ffffff' : '#c9d3cf'],
    dibujar: conAlfa(confeti),
  },
  sanvalentin: { movimiento: 'cae', densidad: 1.6, tam: [7, 12], velocidad: [0.3, 0.7], colores: () => ['#f0446a', '#ff8fa3', '#ffb3c1'], dibujar: conAlfa(corazon) },
  aqua: { movimiento: 'sube', densidad: 1.4, tam: [3, 8], velocidad: [0.2, 0.5], colores: (_o, m) => [m[0]!, m[1]!], dibujar: conAlfa(burbuja) },
  oceano: { movimiento: 'flota', densidad: 0.7, tam: [14, 30], velocidad: [0.08, 0.2], colores: (_o, m) => [m[0]!, m[1]!], dibujar: conAlfa(luz) },
  bosque: { movimiento: 'cae', densidad: 1.3, tam: [5, 9], velocidad: [0.3, 0.7], colores: (_o, m) => [m[0]!, m[1]!, m[2]!], dibujar: conAlfa(hoja) },
  ambar: { movimiento: 'flota', densidad: 1.4, tam: [2, 4], velocidad: [0.15, 0.35], colores: (_o, m) => [m[0]!, '#ffe08a'], dibujar: conAlfa(luz) },
  ciruela: { movimiento: 'titila', densidad: 2, tam: [3, 7], velocidad: [0, 0], colores: (_o, m) => [m[0]!, m[1]!], dibujar: conAlfa(estrella) },
  coral: { movimiento: 'sube', densidad: 1.3, tam: [2, 3.5], velocidad: [0.15, 0.4], colores: (_o, m) => [m[0]!, '#ffd2a6'], dibujar: conAlfa(luz) },
  grafito: { movimiento: 'flota', densidad: 1.2, tam: [1, 2], velocidad: [0.05, 0.15], colores: (_o, m) => [m[1]!, m[2]!], dibujar: conAlfa(punto) },
  rosa: { movimiento: 'cae', densidad: 1.4, tam: [4, 7], velocidad: [0.3, 0.6], colores: (_o, m) => [m[0]!, m[1]!], dibujar: conAlfa(petalo) },
  vino: { movimiento: 'sube', densidad: 2.2, tam: [1.2, 3], velocidad: [0.25, 0.6], colores: (_o, m) => [m[0]!, m[1]!], dibujar: conAlfa(burbuja) },
};

const MAX_PARTICULAS = 60;
const azar = (a: number, b: number) => a + Math.random() * (b - a);

export function Ambiente() {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = lienzo.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const raiz = document.documentElement;
    let particulas: Particula[] = [];
    let efecto: Efecto | null = null;
    let cuadro = 0;
    let ultimo = 0;
    let ancho = 0;
    let alto = 0;

    const nueva = (e: Efecto, colores: string[], inicial: boolean): Particula => {
      const v = azar(e.velocidad[0], e.velocidad[1]);
      return {
        x: azar(0, ancho),
        // Al inicio se reparten por toda la pantalla; después nacen fuera del borde por donde entran.
        y: inicial || e.movimiento === 'flota' || e.movimiento === 'titila' ? azar(0, alto) : e.movimiento === 'cae' ? azar(-60, -10) : alto + azar(10, 60),
        tam: azar(e.tam[0], e.tam[1]),
        vx: e.movimiento === 'flota' ? azar(-v, v) : 0,
        vy: e.movimiento === 'cae' ? v : e.movimiento === 'sube' ? -v : azar(-v, v),
        giro: azar(0, Math.PI * 2),
        vgiro: azar(-0.02, 0.02),
        fase: azar(0, Math.PI * 2),
        color: colores[Math.floor(Math.random() * colores.length)]!,
        forma: Math.random(),
      };
    };

    const configurar = () => {
      cancelAnimationFrame(cuadro);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = window.innerWidth;
      alto = window.innerHeight;
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      const apagado = menosMovimiento() || raiz.dataset.animaciones === 'no' || document.hidden;
      if (apagado) {
        particulas = [];
        return;
      }
      const acento = (raiz.dataset.acento as Acento | undefined) ?? 'aqua';
      const tema = raiz.dataset.theme;
      const oscuro = tema === 'dark' || (!tema && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const estilo = getComputedStyle(raiz);
      const marca = ['--marca-1', '--marca-2', '--marca-3'].map((v) => estilo.getPropertyValue(v).trim() || '#888888');
      efecto = EFECTOS[acento] ?? EFECTOS.aqua;
      const colores = efecto.colores(oscuro, marca);
      const n = Math.min(MAX_PARTICULAS, Math.round(((ancho * alto) / 100_000) * efecto.densidad));
      const e = efecto;
      particulas = Array.from({ length: n }, () => nueva(e, colores, true));
      ultimo = 0;
      cuadro = requestAnimationFrame(paso);
    };

    const paso = (t: number) => {
      cuadro = requestAnimationFrame(paso);
      // ~30 cuadros por segundo: suficiente para algo lento y gasta la mitad.
      if (t - ultimo < 32) return;
      const dt = ultimo ? Math.min((t - ultimo) / 16.7, 3) : 1;
      ultimo = t;
      const e = efecto;
      if (!e) return;
      ctx.clearRect(0, 0, ancho, alto);
      for (const p of particulas) {
        p.fase += 0.03 * dt;
        p.giro += p.vgiro * dt;
        if (e.movimiento === 'cae' || e.movimiento === 'sube') {
          p.y += p.vy * dt;
          p.x += Math.sin(p.fase) * 0.4 * dt;
        } else if (e.movimiento === 'flota') {
          p.x += (p.vx + Math.sin(p.fase) * 0.15) * dt;
          p.y += (p.vy + Math.cos(p.fase * 0.8) * 0.15) * dt;
        }
        // Al salir por un borde vuelve a entrar por el contrario (misma partícula, sin crear objetos).
        if (p.y > alto + 60) p.y = -40;
        if (p.y < -60) p.y = alto + 40;
        if (p.x > ancho + 60) p.x = -40;
        if (p.x < -60) p.x = ancho + 40;
        const alfa = e.movimiento === 'titila' ? 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(p.fase * 1.6)) : e.movimiento === 'flota' ? 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(p.fase)) : 0.55;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        e.dibujar(ctx, p, alfa);
        ctx.restore();
      }
    };

    configurar();
    // Se reconfigura al cambiar paleta, modo o el interruptor (atributos del <html>), al cambiar el tamaño,
    // al ocultar o mostrar la pestaña y si el equipo cambia "reducir movimiento" o su modo oscuro.
    const observador = new MutationObserver(configurar);
    observador.observe(raiz, { attributes: true, attributeFilter: ['data-acento', 'data-theme', 'data-animaciones'] });
    let espera = 0;
    const alCambiarTamano = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(configurar, 200);
    };
    window.addEventListener('resize', alCambiarTamano);
    document.addEventListener('visibilitychange', configurar);
    const consultas = ['(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)'].map((q) => window.matchMedia(q));
    for (const q of consultas) q.addEventListener('change', configurar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(espera);
      observador.disconnect();
      window.removeEventListener('resize', alCambiarTamano);
      document.removeEventListener('visibilitychange', configurar);
      for (const q of consultas) q.removeEventListener('change', configurar);
    };
  }, []);

  return <canvas ref={lienzo} className="ambiente" aria-hidden="true" />;
}
