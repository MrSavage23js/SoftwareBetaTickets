// Se ejecuta una vez antes de todas las pruebas: aplica migraciones en la BD de pruebas.
import { ENV_PRUEBAS } from '../vitest.config';

export default async function prepararGlobal() {
  Object.assign(process.env, ENV_PRUEBAS);
  const { migrarAlUltimo } = await import('../src/db/migrador');
  const { cerrarBD } = await import('../src/db/conexion');
  try {
    await migrarAlUltimo();
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    throw new Error(
      `No se pudo preparar la BD de pruebas (${process.env.DB_NAME_TEST ?? 'mesa_ayuda_test'}): ${mensaje}\n` +
        '¿Está PostgreSQL encendido? (npm run db:local -- iniciar)',
    );
  } finally {
    await cerrarBD();
  }
}
