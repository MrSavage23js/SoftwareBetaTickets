// Tareas de fondo del proceso: cola de correo y limpieza periódica.
// Cada tarea atrapa sus errores: una falla (p. ej. BD caída un momento) se registra y se reintenta
// en la siguiente vuelta, sin tumbar el servidor.
import { sql } from 'kysely';
import { env } from './config/env';
import { db } from './db/conexion';
import { logger } from './lib/logger';
import { limpiarCarpetaTemporal } from './modulos/adjuntos/almacenamiento';
import { limpiarTemporalesHuerfanos } from './modulos/adjuntos/servicio';
import { limpiarSesionesVencidas } from './modulos/auth/sesiones';
import { procesarCola } from './modulos/correos/trabajador';

interface Tarea {
  nombre: string;
  cadaMs: number;
  ejecutar: () => Promise<unknown>;
  timer?: NodeJS.Timeout;
  enCurso?: Promise<unknown>;
}

const tareas: Tarea[] = [
  {
    nombre: 'cola-correo',
    cadaMs: env.MAIL_COLA_INTERVALO_SEG * 1000,
    // Si el lote vino lleno, sigue vaciando la cola sin esperar al siguiente intervalo.
    ejecutar: async () => {
      let n: number;
      do n = await procesarCola();
      while (n >= 10 && !detenido);
    },
  },
  {
    nombre: 'limpieza',
    cadaMs: 10 * 60_000,
    ejecutar: async () => {
      const sesiones = await limpiarSesionesVencidas();
      const temporales = (await limpiarTemporalesHuerfanos()) + (await limpiarCarpetaTemporal());
      await db.deleteFrom('intentos_login').where('creado_at', '<', sql<Date>`NOW(3) - INTERVAL 90 DAY`).execute();
      if (sesiones || temporales) logger.info({ sesiones, temporales }, 'Limpieza periódica');
    },
  },
];

let detenido = false;

function programar(t: Tarea, esperaMs: number) {
  if (detenido) return;
  t.timer = setTimeout(async () => {
    t.enCurso = t.ejecutar().catch((e: unknown) => logger.error({ err: e, tarea: t.nombre }, 'Falló una tarea de fondo'));
    await t.enCurso;
    t.enCurso = undefined;
    programar(t, t.cadaMs);
  }, esperaMs);
}

export function iniciarTareas(): void {
  detenido = false;
  for (const t of tareas) programar(t, 3_000);
}

export async function detenerTareas(): Promise<void> {
  detenido = true;
  for (const t of tareas) clearTimeout(t.timer);
  await Promise.all(tareas.map((t) => t.enCurso));
}
