// Protección CSRF (DECISIONES D8), en tres capas:
// 1. Cookie SameSite=Strict (el navegador no la manda desde otros sitios).
// 2. Origin/Referer debe ser el propio sistema en toda petición que modifica datos.
// 3. Con sesión: la cabecera X-CSRF-Token debe coincidir con el token guardado en la sesión.
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { errores } from '../lib/errores';
import { igualesSeguro } from '../modulos/auth/sesiones';

const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const origenPermitido = new URL(env.APP_URL).origin;

function origenDe(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).origin;
  } catch {
    return null;
  }
}

export const proteccionCsrf: RequestHandler = (req, _res, next) => {
  if (SEGUROS.has(req.method)) return next();

  const origen = origenDe(req.get('origin')) ?? origenDe(req.get('referer'));
  // En desarrollo Vite sirve la web en otro puerto pero reenvía /api (proxy) con el Host original.
  const mismoHost = origen !== null && new URL(origen).host === req.get('host');
  if (origen !== origenPermitido && !mismoHost) {
    if (!(env.NODE_ENV === 'test' && origen === null)) throw errores.csrf();
  }

  if (req.sesion) {
    const token = req.get('x-csrf-token') ?? '';
    if (!igualesSeguro(token, req.sesion.csrfToken)) throw errores.csrf();
  }
  next();
};
