import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { COOKIE_SESION, env } from '../config/env';
import { errores } from '../lib/errores';
import { logger } from '../lib/logger';
import { resolverSesion, tocarSesion } from '../modulos/auth/sesiones';

/** Cabecera que manda la web en consultas automáticas (refrescos, sondeos): NO cuentan como actividad. */
export const CABECERA_SIN_ACTIVIDAD = 'x-sin-actividad';

export function opcionesCookie() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict' as const,
    path: '/',
  };
}

/** Carga la sesión si hay cookie. No exige sesión (eso lo hace `requiereSesion`). */
export const cargarSesion: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[COOKIE_SESION];
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return next();

  const r = await resolverSesion(token);
  if (!r.ok) {
    res.clearCookie(COOKIE_SESION, opcionesCookie());
    res.locals.motivoSinSesion = r.motivo;
    return next();
  }
  req.usuario = r.usuario;
  req.sesion = r.sesion;

  const esActividad = req.method !== 'GET' || req.get(CABECERA_SIN_ACTIVIDAD) !== '1';
  if (esActividad) {
    // No se espera: registrar actividad nunca debe frenar ni tumbar la petición.
    tocarSesion(r.sesion.id, r.ultimaActividad).catch((e: unknown) =>
      logger.warn({ err: e }, 'No se pudo actualizar la actividad de la sesión'),
    );
  }
  next();
};

export function requiereSesion(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario) {
    const motivo = res.locals.motivoSinSesion as string | undefined;
    throw errores.noAutenticado(
      motivo === 'INACTIVIDAD'
        ? 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo.'
        : motivo === 'CERRADA'
          ? 'Tu sesión fue cerrada. Inicia sesión de nuevo.'
          : undefined,
    );
  }
  next();
}

/** Exige TODOS los permisos indicados. */
export function requierePermiso(...permisos: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) throw errores.noAutenticado();
    if (!permisos.every((p) => req.usuario!.permisos.has(p))) throw errores.prohibido();
    next();
  };
}

/** Exige AL MENOS UNO de los permisos indicados. */
export function requiereAlgunPermiso(...permisos: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) throw errores.noAutenticado();
    if (!permisos.some((p) => req.usuario!.permisos.has(p))) throw errores.prohibido();
    next();
  };
}
