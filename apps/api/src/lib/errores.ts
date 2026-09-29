// Errores de dominio. Cualquier error que NO sea ErrorApp se trata como 500 y su detalle
// solo va al log; al usuario le llega un mensaje genérico con el id de la petición.
export class ErrorApp extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}

export const errores = {
  validacion: (mensaje: string, campos?: Record<string, string>) => new ErrorApp(400, 'VALIDACION', mensaje, campos),
  noAutenticado: (mensaje = 'Tu sesión terminó. Inicia sesión de nuevo.') => new ErrorApp(401, 'NO_AUTENTICADO', mensaje),
  prohibido: (mensaje = 'No tienes permiso para realizar esta acción.') => new ErrorApp(403, 'PROHIBIDO', mensaje),
  csrf: () => new ErrorApp(403, 'CSRF', 'La página estaba desactualizada. Recárgala e inténtalo de nuevo.'),
  noEncontrado: (mensaje = 'No se encontró lo que buscas.') => new ErrorApp(404, 'NO_ENCONTRADO', mensaje),
  conflicto: (mensaje: string, codigo = 'CONFLICTO') => new ErrorApp(409, codigo, mensaje),
  demasiadas: (mensaje = 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.') =>
    new ErrorApp(429, 'DEMASIADAS_SOLICITUDES', mensaje),
  archivo: (mensaje: string) => new ErrorApp(400, 'ARCHIVO_INVALIDO', mensaje),
};

/** Error de MySQL por llave única duplicada. */
export function esDuplicado(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ER_DUP_ENTRY';
}
