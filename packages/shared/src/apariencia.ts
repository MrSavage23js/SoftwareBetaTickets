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
  'muertos',
] as const;

export type Tema = (typeof TEMAS)[number];
export type Acento = (typeof ACENTOS)[number];

export interface Apariencia {
  tema: Tema;
  acento: Acento;
}

export const APARIENCIA_INICIAL: Apariencia = { tema: 'sistema', acento: 'aqua' };

export const esquemaApariencia = z.object({
  tema: z.enum(TEMAS, 'Modo no válido.'),
  acento: z.enum(ACENTOS, 'Color no válido.'),
});

/** Lo guardado (o nada, o un valor viejo) convertido siempre en una apariencia válida. */
export function leerApariencia(valor: unknown): Apariencia {
  const r = esquemaApariencia.safeParse(valor);
  return r.success ? r.data : APARIENCIA_INICIAL;
}
