import { describe, expect, it } from 'vitest';
import {
  erroresPorCampo,
  esquemaCambiarPassword,
  esquemaEmpresa,
  esquemaListarTickets,
  esquemaLogin,
  esquemaPassword,
  esquemaTicketCrear,
  esquemaUsuarioCrear,
  formatearFolio,
  prefijoFolio,
} from '../src';

describe('folio', () => {
  it('arma el prefijo con los códigos de empresa y tipo', () => {
    expect(prefijoFolio('AS', 'CA')).toBe('ASCA');
    expect(prefijoFolio(' ma ', 'ce')).toBe('MACE');
  });

  it('rechaza códigos inválidos', () => {
    expect(() => prefijoFolio('A', 'CA')).toThrow();
    expect(() => prefijoFolio('AS-', 'CA')).toThrow();
    expect(() => prefijoFolio('ABCDE', 'CA')).toThrow();
  });

  it('rellena el consecutivo a 4 dígitos y crece después de 9999', () => {
    expect(formatearFolio('ASCA', 63)).toBe('ASCA-0063');
    expect(formatearFolio('VPCO', 170)).toBe('VPCO-0170');
    expect(formatearFolio('ASCA', 9999)).toBe('ASCA-9999');
    expect(formatearFolio('ASCA', 10000)).toBe('ASCA-10000');
  });

  it('rechaza consecutivos no válidos', () => {
    expect(() => formatearFolio('ASCA', 0)).toThrow();
    expect(() => formatearFolio('ASCA', 1.5)).toThrow();
  });
});

describe('esquemas de validación', () => {
  it('login exige usuario y contraseña', () => {
    const r = esquemaLogin.safeParse({ username: '  ', password: '' });
    expect(r.success).toBe(false);
    expect(erroresPorCampo(r.error!)).toMatchObject({ username: expect.any(String), password: expect.any(String) });
  });

  it('contraseña: longitud mínima configurable, letras y números', () => {
    expect(esquemaPassword().safeParse('corta1').success).toBe(false);
    expect(esquemaPassword().safeParse('sololetras').success).toBe(false);
    expect(esquemaPassword().safeParse('12345678').success).toBe(false);
    expect(esquemaPassword().safeParse('Valida123').success).toBe(true);
    expect(esquemaPassword(12).safeParse('Valida123').success).toBe(false);
  });

  it('usuario: correo válido, contraseñas iguales, nombre de usuario sin espacios', () => {
    const base = { username: 'Ana_Lopez', email: 'ANA@Empresa.com ', rolId: 1, password: 'Valida123', confirmarPassword: 'Valida123' };
    const ok = esquemaUsuarioCrear.safeParse(base);
    expect(ok.success).toBe(true);
    expect(ok.data?.email).toBe('ana@empresa.com');
    expect(esquemaUsuarioCrear.safeParse({ ...base, confirmarPassword: 'Otra1234' }).error?.issues[0]?.path).toEqual(['confirmarPassword']);
    expect(esquemaUsuarioCrear.safeParse({ ...base, email: 'no-es-correo' }).success).toBe(false);
    expect(esquemaUsuarioCrear.safeParse({ ...base, username: 'Ana Lopez' }).success).toBe(false);
  });

  it('cambiar contraseña: la nueva debe coincidir y ser distinta', () => {
    expect(esquemaCambiarPassword.safeParse({ actual: 'Vieja123', nueva: 'Nueva123', confirmar: 'Nueva123' }).success).toBe(true);
    expect(esquemaCambiarPassword.safeParse({ actual: 'Vieja123', nueva: 'Nueva123', confirmar: 'Otra123' }).success).toBe(false);
    expect(esquemaCambiarPassword.safeParse({ actual: 'Igual123', nueva: 'Igual123', confirmar: 'Igual123' }).success).toBe(false);
  });

  it('empresa: el código se normaliza a mayúsculas y se valida', () => {
    expect(esquemaEmpresa.parse({ nombre: 'Nueva', codigo: 'nv' }).codigo).toBe('NV');
    expect(esquemaEmpresa.safeParse({ nombre: 'Nueva', codigo: 'N V' }).success).toBe(false);
  });

  it('ticket: acepta copias por usuario o por correo y rechaza correos inválidos', () => {
    const base = { tipoId: '1', empresaId: 2, descripcionHtml: '<p>x</p>' };
    const r = esquemaTicketCrear.parse({ ...base, copias: [{ usuarioId: 3 }, { email: 'X@Y.COM' }] });
    expect(r.tipoId).toBe(1);
    expect(r.copias).toEqual([{ usuarioId: 3 }, { email: 'x@y.com' }]);
    expect(esquemaTicketCrear.safeParse({ ...base, copias: [{ email: 'malo' }] }).success).toBe(false);
    expect(esquemaTicketCrear.safeParse({ ...base, tipoId: 'abc' }).success).toBe(false);
  });

  it('listar: valores por defecto, límites de paginación y fechas', () => {
    expect(esquemaListarTickets.parse({})).toMatchObject({ pagina: 1, porPagina: 25, orden: 'recientes' });
    expect(esquemaListarTickets.safeParse({ porPagina: 1000 }).success).toBe(false);
    expect(esquemaListarTickets.safeParse({ estatus: 'INVENTADO' }).success).toBe(false);
    expect(esquemaListarTickets.safeParse({ desde: '2026-13-40' }).success).toBe(false);
    expect(esquemaListarTickets.parse({ asignadoAId: 'ninguno' }).asignadoAId).toBe('ninguno');
  });
});
