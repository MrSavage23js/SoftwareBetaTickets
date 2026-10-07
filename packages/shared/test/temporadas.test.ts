import { describe, expect, it } from 'vitest';
import { acentoVisible, leerApariencia, temporadaEn } from '../src/apariencia';

const dia = (mes: number, d: number, anio = 2026) => new Date(anio, mes - 1, d, 12);

describe('temporadas', () => {
  it('reconoce cada temporada en sus orillas y fuera de ellas', () => {
    expect(temporadaEn(dia(10, 24))).toBeNull();
    expect(temporadaEn(dia(10, 25))?.acento).toBe('muertos');
    expect(temporadaEn(dia(11, 3))?.acento).toBe('muertos');
    expect(temporadaEn(dia(11, 4))).toBeNull();
    expect(temporadaEn(dia(9, 1))?.acento).toBe('patrias');
    expect(temporadaEn(dia(9, 30))?.acento).toBe('patrias');
    expect(temporadaEn(dia(2, 14))?.acento).toBe('sanvalentin');
    expect(temporadaEn(dia(2, 16))).toBeNull();
  });

  it('Navidad cruza el año', () => {
    expect(temporadaEn(dia(11, 30))).toBeNull();
    expect(temporadaEn(dia(12, 1))?.acento).toBe('navidad');
    expect(temporadaEn(dia(12, 31))?.acento).toBe('navidad');
    expect(temporadaEn(dia(1, 6, 2027))?.acento).toBe('navidad');
    expect(temporadaEn(dia(1, 7, 2027))).toBeNull();
  });

  it('solo cambia a quien usa Aqua con las temporadas encendidas', () => {
    const noviembre = dia(11, 1);
    expect(acentoVisible({ tema: 'sistema', acento: 'aqua', temporada: true, avatar: null }, noviembre)).toBe('muertos');
    expect(acentoVisible({ tema: 'sistema', acento: 'aqua', temporada: false, avatar: null }, noviembre)).toBe('aqua');
    expect(acentoVisible({ tema: 'sistema', acento: 'bosque', temporada: true, avatar: null }, noviembre)).toBe('bosque');
    expect(acentoVisible({ tema: 'sistema', acento: 'aqua', temporada: true, avatar: null }, dia(7, 1))).toBe('aqua');
  });

  it('una apariencia guardada antes de las temporadas las trae encendidas', () => {
    expect(leerApariencia({ tema: 'oscuro', acento: 'coral' })).toEqual({ tema: 'oscuro', acento: 'coral', temporada: true, avatar: null });
  });
});
