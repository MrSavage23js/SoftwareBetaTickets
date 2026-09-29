import { defineConfig } from 'vitest/config';

// Variables para las pruebas: BD de pruebas (DB_NAME_TEST), carpeta de archivos aparte y correo en consola.
// Se aplican antes de que cualquier módulo lea la configuración.
export const ENV_PRUEBAS = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3100',
  STORAGE_DIR: './storage/pruebas',
  MAIL_TRANSPORT: 'consola',
  LOG_LEVEL: 'silent',
  // Las pruebas crean sus propios usuarios; no se siembra el admin de .env.
  ADMIN_INICIAL_USUARIO: '',
  ADMIN_INICIAL_EMAIL: '',
  ADMIN_INICIAL_PASSWORD: '',
};

export default defineConfig({
  test: {
    env: ENV_PRUEBAS,
    globalSetup: ['./test/preparar-global.ts'],
    include: ['test/**/*.test.ts'],
    // Todos los archivos comparten la misma BD de pruebas: se ejecutan uno tras otro.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
