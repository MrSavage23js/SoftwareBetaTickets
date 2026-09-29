// Límites de peticiones. Ojo: en una oficina muchos usuarios salen por la misma IP (NAT),
// así que con sesión el límite se cuenta por usuario, y sin sesión por IP con un margen amplio.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { errores } from '../lib/errores';

const clave = (req: Request) => (req.usuario ? `u:${req.usuario.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`);
const enPruebas = env.NODE_ENV === 'test';

function limite(ventanaMin: number, max: number, mensaje?: string) {
  return rateLimit({
    windowMs: ventanaMin * 60_000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clave,
    skip: () => enPruebas,
    handler: (_req, _res, next) => next(errores.demasiadas(mensaje)),
  });
}

/** General para toda la API. */
export const limiteGeneral = limite(5, 1500);

/** Inicio de sesión: además del bloqueo por usuario que se guarda en BD. */
export const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  skip: () => enPruebas,
  handler: (_req, _res, next) =>
    next(errores.demasiadas('Demasiados intentos de inicio de sesión desde este equipo. Espera 15 minutos.')),
});

/** Subida de archivos y creación de tickets. */
export const limiteEscritura = limite(5, 120, 'Estás enviando demasiadas solicitudes seguidas. Espera un momento.');
