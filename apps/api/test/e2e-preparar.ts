// Deja la BD de pruebas lista para los recorridos de Playwright (misma base que las pruebas de API).
import { ENV_PRUEBAS } from '../vitest.config';

Object.assign(process.env, ENV_PRUEBAS, { STORAGE_DIR: './storage/e2e' });

const { migrarAlUltimo } = await import('../src/db/migrador');
const { reiniciarBD } = await import('./ayudas');
const { cerrarBD } = await import('../src/db/conexion');
try {
  await migrarAlUltimo();
  await reiniciarBD();
  process.stdout.write('BD de pruebas lista para e2e\n');
} finally {
  await cerrarBD();
}
