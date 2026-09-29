import pino from 'pino';
import { env } from '../config/env';

// Nunca deben llegar a los registros: contraseñas, cookies, tokens CSRF ni cuerpos HTML completos.
const REDACTAR = [
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.confirmarPassword',
  '*.password_hash',
  '*.passwordHash',
  '*.csrfToken',
  '*.csrf_token',
  '*.token',
  '*.SMTP_PASS',
  '*.GRAPH_CLIENT_SECRET',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTAR, censor: '[oculto]' },
  base: { app: 'mesa-ayuda' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' } } }
    : {}),
});
