import { erroresPorCampo } from '@mesa/shared';
import type { z } from 'zod';
import { errores } from './errores';

/** Valida y devuelve los datos ya transformados, o lanza un 400 con el error de cada campo. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const campos = erroresPorCampo(r.error);
    const primero = Object.values(campos)[0] ?? 'Revisa los datos enviados.';
    throw errores.validacion(primero, campos);
  }
  return r.data;
}

/** Lee el parámetro :id de la URL como entero positivo; si no lo es, 404 (no existe ese recurso). */
export function idDeRuta(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 53) throw errores.noEncontrado();
  return n;
}

/** Los campos de formularios multipart llegan en "datos" como JSON. */
export function jsonDeFormulario(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor ?? {};
  try {
    return JSON.parse(valor);
  } catch {
    throw errores.validacion('El formulario llegó incompleto. Recarga la página e inténtalo de nuevo.');
  }
}
