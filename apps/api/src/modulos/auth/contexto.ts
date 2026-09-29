import type { Request } from 'express';
import { errores } from '../../lib/errores';

export interface UsuarioActual {
  id: number;
  username: string;
  nombre: string | null;
  email: string;
  rolId: number;
  rolCodigo: string;
  rolNombre: string;
  permisos: ReadonlySet<string>;
}

export interface SesionActual {
  id: string;
  csrfToken: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioActual;
    sesion?: SesionActual;
  }
}

/** Usuario autenticado de la petición (el middleware `requiereSesion` garantiza que existe). */
export function actor(req: Request): UsuarioActual {
  if (!req.usuario) throw errores.noAutenticado();
  return req.usuario;
}

export const tienePermiso = (u: UsuarioActual, p: string) => u.permisos.has(p);

export const nombreVisible = (u: { nombre: string | null; username: string }) => u.nombre?.trim() || u.username;

export function ipDe(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? '').slice(0, 45);
}
