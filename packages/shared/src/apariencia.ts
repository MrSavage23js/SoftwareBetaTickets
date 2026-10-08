// Apariencia que elige cada usuario: modo claro/oscuro y paleta de color. Se guarda por usuario en el
// servidor (lo sigue a cualquier equipo) y la web la copia en el navegador para aplicarla antes de cargar.
import { z } from 'zod';

export const TEMAS = ['sistema', 'claro', 'oscuro'] as const;
export const ACENTOS = [
  'aqua',
  'oceano',
  'bosque',
  'ambar',
  'ciruela',
  'coral',
  'grafito',
  'rosa',
  'vino',
  'muertos',
  'navidad',
  'patrias',
  'sanvalentin',
] as const;

/** Avatares de la galería (dibujos en la web: componentes/Avatares.tsx). null = las iniciales. */
export const AVATARES = [
  'gato',
  'perro',
  'zorro',
  'oso',
  'panda',
  'buho',
  'conejo',
  'pinguino',
  'robot',
  'astronauta',
  'cohete',
  'cactus',
  'cafe',
  'estrella',
  'rayo',
  'planta',
] as const;

export type Tema = (typeof TEMAS)[number];
export type Acento = (typeof ACENTOS)[number];
export type Avatar = (typeof AVATARES)[number];

export interface Apariencia {
  tema: Tema;
  acento: Acento;
  /** Si usa la paleta de omisión (Aqua), en cada temporada cambia sola a la de temporada. */
  temporada: boolean;
  /** Dibujo de la galería en lugar de las iniciales; lo ven también los demás (tickets, conversación, usuarios). */
  avatar: Avatar | null;
  /** Animaciones decorativas (transición al cambiar de tema, adornos, gestos de avatar, brillo). */
  animaciones: boolean;
}

export const APARIENCIA_INICIAL: Apariencia = { tema: 'sistema', acento: 'aqua', temporada: true, avatar: null, animaciones: true };

export const esquemaApariencia = z.object({
  tema: z.enum(TEMAS, 'Modo no válido.'),
  acento: z.enum(ACENTOS, 'Color no válido.'),
  // Las apariencias guardadas antes de existir las temporadas no lo traen: se toman como encendidas.
  temporada: z.boolean('Valor no válido.').default(true),
  // Igual que temporada: lo guardado antes no lo trae y se toma como "iniciales".
  avatar: z.enum(AVATARES, 'Avatar no válido.').nullable().default(null),
  animaciones: z.boolean('Valor no válido.').default(true),
});

/** Lo guardado (o nada, o un valor viejo) convertido siempre en una apariencia válida. */
export function leerApariencia(valor: unknown): Apariencia {
  const r = esquemaApariencia.safeParse(valor);
  return r.success ? r.data : APARIENCIA_INICIAL;
}

// ---------------------------------------------------------------- Temporadas
export interface Temporada {
  acento: Acento;
  nombre: string;
  /** [mes, día] de inicio y fin, ambos incluidos. Si el fin es antes que el inicio, cruza el año. */
  desde: [number, number];
  hasta: [number, number];
}

export const TEMPORADAS: Temporada[] = [
  { acento: 'sanvalentin', nombre: 'San Valentín', desde: [2, 7], hasta: [2, 15] },
  { acento: 'patrias', nombre: 'Fiestas patrias', desde: [9, 1], hasta: [9, 30] },
  { acento: 'muertos', nombre: 'Día de Muertos', desde: [10, 25], hasta: [11, 3] },
  { acento: 'navidad', nombre: 'Navidad', desde: [12, 1], hasta: [1, 6] },
];

const clave = ([mes, dia]: [number, number]) => mes * 100 + dia;

/** La temporada que corre en esa fecha (en la hora local de quien la llama), o null. */
export function temporadaEn(fecha: Date): Temporada | null {
  const hoy = clave([fecha.getMonth() + 1, fecha.getDate()]);
  return (
    TEMPORADAS.find((t) => {
      const desde = clave(t.desde);
      const hasta = clave(t.hasta);
      return desde <= hasta ? hoy >= desde && hoy <= hasta : hoy >= desde || hoy <= hasta;
    }) ?? null
  );
}

/** La paleta que se ve: la elegida, salvo que use Aqua con temporadas encendidas y haya una en curso. */
export function acentoVisible(a: Apariencia, fecha = new Date()): Acento {
  if (!a.temporada || a.acento !== 'aqua') return a.acento;
  return temporadaEn(fecha)?.acento ?? a.acento;
}
