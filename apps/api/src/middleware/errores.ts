import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { erroresPorCampo, type ErrorApi } from '@mesa/shared';
import { ErrorApp } from '../lib/errores';

const MENSAJES_MULTER: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Un archivo supera el tamaño máximo permitido.',
  LIMIT_FILE_COUNT: 'Se enviaron demasiados archivos.',
  LIMIT_UNEXPECTED_FILE: 'Se envió un archivo en un campo no esperado.',
  LIMIT_FIELD_VALUE: 'Un campo del formulario es demasiado grande.',
  LIMIT_PART_COUNT: 'El formulario tiene demasiadas partes.',
};

export const rutaNoEncontrada: RequestHandler = (req, res) => {
  const cuerpo: ErrorApi = { error: { codigo: 'NO_ENCONTRADO', mensaje: `No existe la ruta ${req.method} ${req.path}` } };
  res.status(404).json(cuerpo);
};

export const manejarErrores: ErrorRequestHandler = (err, req, res, _next) => {
  let estado = 500;
  let cuerpo: ErrorApi;

  if (err instanceof ErrorApp) {
    estado = err.estado;
    cuerpo = { error: { codigo: err.codigo, mensaje: err.message, ...(err.campos ? { campos: err.campos } : {}) } };
  } else if (err instanceof ZodError) {
    estado = 400;
    const campos = erroresPorCampo(err);
    cuerpo = { error: { codigo: 'VALIDACION', mensaje: Object.values(campos)[0] ?? 'Datos inválidos.', campos } };
  } else if (err instanceof MulterError) {
    estado = 400;
    cuerpo = { error: { codigo: 'ARCHIVO_INVALIDO', mensaje: MENSAJES_MULTER[err.code] ?? 'No se pudo recibir el archivo.' } };
  } else if (err?.type === 'entity.parse.failed') {
    estado = 400;
    cuerpo = { error: { codigo: 'JSON_INVALIDO', mensaje: 'La solicitud no tiene un formato válido.' } };
  } else if (err?.type === 'entity.too.large') {
    estado = 413;
    cuerpo = { error: { codigo: 'DEMASIADO_GRANDE', mensaje: 'La solicitud es demasiado grande.' } };
  } else {
    req.log?.error({ err }, 'Error no controlado');
    cuerpo = {
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: `Ocurrió un error inesperado. Inténtalo de nuevo; si continúa, reporta este código: ${String(req.id ?? '')}`,
      },
    };
  }

  if (estado < 500 && estado !== 404) req.log?.info({ codigo: cuerpo.error.codigo, estado }, cuerpo.error.mensaje);
  if (res.headersSent) return;
  res.status(estado).json(cuerpo);
};
