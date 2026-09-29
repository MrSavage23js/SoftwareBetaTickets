// Cliente HTTP para la API. Convierte cualquier falla (red caída, error del servidor, respuesta rara)
// en un ErrorCliente con un mensaje en español listo para mostrar; nunca deja la pantalla "rota".
import type { ErrorApi } from '@mesa/shared';

export class ErrorCliente extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
    this.name = 'ErrorCliente';
  }
}

export const EVENTO_SESION_EXPIRADA = 'mesa:sesion-expirada';

let csrfToken = '';
export const fijarCsrf = (t: string) => {
  csrfToken = t;
};

type Consulta = Record<string, string | number | boolean | null | undefined>;

interface Opciones {
  json?: unknown;
  form?: FormData;
  consulta?: Consulta;
  /** Consultas automáticas: no cuentan como actividad del usuario para el cierre por inactividad. */
  sinActividad?: boolean;
  signal?: AbortSignal;
}

export function aQuery(c?: Consulta): string {
  if (!c) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(c)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function pedir<T>(metodo: string, ruta: string, o: Opciones = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (metodo !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (o.sinActividad) headers['X-Sin-Actividad'] = '1';
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${ruta}${aQuery(o.consulta)}`, {
      method: metodo,
      headers,
      body,
      credentials: 'same-origin',
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ErrorCliente(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  }

  if (res.status === 204) return undefined as T;
  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ErrorCliente(
      res.status,
      'RESPUESTA_INVALIDA',
      res.status >= 500 || res.status === 0
        ? `El servidor no está respondiendo (código ${res.status}). Inténtalo en un momento.`
        : 'El servidor envió una respuesta inesperada.',
    );
  }

  if (!res.ok) {
    const e = (cuerpo as ErrorApi)?.error;
    const error = new ErrorCliente(res.status, e?.codigo ?? 'ERROR', e?.mensaje ?? 'Ocurrió un error.', e?.campos);
    if (res.status === 401 && !ruta.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA, { detail: error.message }));
    }
    throw error;
  }
  return cuerpo as T;
}

export const api = {
  get: <T>(ruta: string, consulta?: Consulta, signal?: AbortSignal) => pedir<T>('GET', ruta, { consulta, sinActividad: true, signal }),
  post: <T = void>(ruta: string, json?: unknown) => pedir<T>('POST', ruta, { json: json ?? {} }),
  put: <T = void>(ruta: string, json: unknown) => pedir<T>('PUT', ruta, { json }),
  delete: <T = void>(ruta: string) => pedir<T>('DELETE', ruta),
  form: <T = void>(ruta: string, datos: unknown, archivos: File[] = []) => {
    const f = new FormData();
    f.set('datos', JSON.stringify(datos));
    for (const a of archivos) f.append('archivos', a, a.name);
    return pedir<T>('POST', ruta, { form: f });
  },
  subirImagen: (archivo: File) => {
    const f = new FormData();
    f.set('archivo', archivo, archivo.name);
    return pedir<{ uuid: string; url: string }>('POST', '/adjuntos/temporal', { form: f });
  },
};

export function mensajeDe(e: unknown): string {
  if (e instanceof ErrorCliente) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Ocurrió un error inesperado.';
}

export function camposDe(e: unknown): Record<string, string> {
  return e instanceof ErrorCliente && e.campos ? e.campos : {};
}
