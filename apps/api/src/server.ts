// Punto de entrada: migra, siembra lo que falte, abre el puerto y arranca las tareas de fondo.
// Cierre ordenado: deja de aceptar conexiones, espera las peticiones en curso, detiene tareas y cierra la BD.
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { crearApp } from './app';
import { env, RUTAS } from './config/env';
import { cerrarBD } from './db/conexion';
import { migrarAlUltimo } from './db/migrador';
import { sembrar } from './db/seeds';
import { logger } from './lib/logger';
import { iniciarTareas, detenerTareas } from './tareas';

let servidor: Server | undefined;
let cerrando = false;

async function iniciar() {
  for (const d of [RUTAS.storage, RUTAS.adjuntos, RUTAS.correosConsola, RUTAS.temporales]) mkdirSync(d, { recursive: true });

  await migrarAlUltimo();
  await sembrar();

  const app = crearApp();
  servidor = app.listen(env.PORT, () => {
    logger.info(`Mesa de Ayuda escuchando en el puerto ${env.PORT} (${env.NODE_ENV}) — ${env.APP_URL}`);
  });
  servidor.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      logger.fatal(`El puerto ${env.PORT} ya está en uso por otro programa. Cambia PORT en .env.`);
    } else {
      logger.fatal({ err: e }, 'No se pudo abrir el puerto');
    }
    void cerrar('error-puerto', 1);
  });
  servidor.keepAliveTimeout = 65_000;
  servidor.headersTimeout = 66_000;
  servidor.requestTimeout = 120_000;

  iniciarTareas();
}

async function cerrar(senal: string, codigo = 0) {
  if (cerrando) return;
  cerrando = true;
  logger.info(`Recibí ${senal}: cerrando de forma ordenada…`);
  const forzar = setTimeout(() => {
    logger.error('El cierre tardó más de 20 s; se fuerza la salida.');
    process.exit(1);
  }, 20_000);
  forzar.unref();

  try {
    await detenerTareas();
    if (servidor) {
      await new Promise<void>((ok) => {
        servidor!.close(() => ok());
        servidor!.closeIdleConnections();
      });
    }
    await cerrarBD();
    logger.info('Cierre completo.');
  } catch (e) {
    logger.error({ err: e }, 'Error durante el cierre');
    codigo = 1;
  }
  process.exit(codigo);
}

process.on('SIGTERM', () => void cerrar('SIGTERM'));
process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('unhandledRejection', (razon) => {
  // Una promesa sin manejar es un error de programación, pero no justifica tumbar el servicio.
  logger.error({ err: razon }, 'Promesa rechazada sin manejar');
});
process.on('uncaughtException', (e) => {
  // Aquí el estado del proceso ya no es confiable: se registra y se reinicia de forma ordenada
  // (el administrador de servicios —NSSM/systemd— lo vuelve a levantar).
  logger.fatal({ err: e }, 'Excepción no controlada');
  void cerrar('uncaughtException', 1);
});

iniciar().catch((e: unknown) => {
  logger.fatal({ err: e }, 'No se pudo iniciar el servidor');
  void cerrarBD().finally(() => process.exit(1));
});
