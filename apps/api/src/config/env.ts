// Variables de entorno validadas al arrancar. Si algo falta o es inválido, el proceso no arranca
// y dice exactamente qué corregir (mejor fallar al iniciar que a media operación).
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Raíz del monorepo (donde vive .env), tanto en desarrollo (src/) como compilado (dist/). */
function buscarRaiz(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, '.env.example')) || existsSync(join(dir, '.env'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export const RAIZ = buscarRaiz();
dotenv.config({ path: join(RAIZ, '.env'), quiet: true });

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const lista = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z.url('APP_URL debe ser una URL completa, p. ej. https://mesa.grupoaramo.com'),
    APP_TZ: z.string().default('America/Mexico_City'),
    APP_NOMBRE_EMPRESA: z.string().default('Grupo Aramo'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().min(1),
    DB_NAME_TEST: z.string().default('mesa_ayuda_test'),
    DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(10),

    SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('mesa_sid'),
    COOKIE_SECURE: bool,

    STORAGE_DIR: z.string().default('./storage'),
    ADJUNTOS_TECHO_MB: z.coerce.number().min(1).max(200).default(25),

    SESION_INACTIVIDAD_MIN: z.coerce.number().int().default(30),
    SESION_MAX_HORAS: z.coerce.number().int().default(12),
    LOGIN_MAX_INTENTOS: z.coerce.number().int().default(5),
    LOGIN_BLOQUEO_MIN: z.coerce.number().int().default(15),
    ADJUNTOS_MAX_MB: z.coerce.number().default(10),
    ADJUNTOS_MAX_POR_MENSAJE: z.coerce.number().int().default(5),
    ADJUNTOS_TIPOS: lista,

    MAIL_TRANSPORT: z.enum(['consola', 'smtp', 'graph']).default('consola'),
    MAIL_FROM: z.email('MAIL_FROM debe ser un correo válido'),
    MAIL_FROM_NAME: z.string().default('Mesa de Ayuda'),
    MAIL_COLA_INTERVALO_SEG: z.coerce.number().int().min(2).max(3600).default(15),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    GRAPH_TENANT_ID: z.string().default(''),
    GRAPH_CLIENT_ID: z.string().default(''),
    GRAPH_CLIENT_SECRET: z.string().default(''),
    GRAPH_REMITENTE: z.string().default(''),

    ADMIN_INICIAL_USUARIO: z.string().default(''),
    ADMIN_INICIAL_EMAIL: z.string().default(''),
    ADMIN_INICIAL_PASSWORD: z.string().default(''),
  })
  .superRefine((e, ctx) => {
    if (e.MAIL_TRANSPORT === 'smtp' && !e.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'es obligatorio con MAIL_TRANSPORT=smtp' });
    }
    if (e.MAIL_TRANSPORT === 'graph') {
      for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'GRAPH_REMITENTE'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'es obligatorio con MAIL_TRANSPORT=graph' });
      }
    }
    if (e.NODE_ENV === 'production' && !e.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'debe ser true en producción (el sistema debe servirse por HTTPS)',
      });
    }
  });

export type Env = z.infer<typeof esquema>;

function cargar(): Env {
  const r = esquema.safeParse(process.env);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // El logger todavía no existe (depende de esta configuración): se escribe directo a stderr.
    process.stderr.write(`\nConfiguración inválida en .env:\n${detalle}\n\nRevisa .env.example.\n\n`);
    process.exit(1);
  }
  const env = r.data;
  if (env.NODE_ENV === 'test') env.DB_NAME = env.DB_NAME_TEST;
  return env;
}

export const env = cargar();

const abs = (p: string) => (isAbsolute(p) ? p : resolve(RAIZ, p));
export const RUTAS = {
  storage: abs(env.STORAGE_DIR),
  adjuntos: join(abs(env.STORAGE_DIR), 'adjuntos'),
  correosConsola: join(abs(env.STORAGE_DIR), 'correos-consola'),
  temporales: join(abs(env.STORAGE_DIR), 'tmp'),
  web: join(RAIZ, 'apps', 'web', 'dist'),
};
