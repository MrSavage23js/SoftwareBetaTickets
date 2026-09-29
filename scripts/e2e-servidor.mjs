#!/usr/bin/env node
// Servidor para las pruebas de Playwright: reinicia la BD de pruebas, compila la web si hace falta
// y levanta la API en :3101 contra la BD de pruebas (nunca toca la BD de desarrollo).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './env.mjs';

const ENV = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: '3101',
  APP_URL: 'http://localhost:3101',
  STORAGE_DIR: './storage/e2e',
  MAIL_TRANSPORT: 'consola',
  MAIL_COLA_INTERVALO_SEG: '2',
  ADMIN_INICIAL_USUARIO: '',
  ADMIN_INICIAL_EMAIL: '',
  ADMIN_INICIAL_PASSWORD: '',
};
const API = join(RAIZ, 'apps', 'api');

const ejecutar = (args, cwd) => {
  const r = spawnSync(process.execPath, args, { cwd, env: ENV, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

ejecutar(['--import', 'tsx', 'test/e2e-preparar.ts'], API);
if (!existsSync(join(RAIZ, 'apps', 'web', 'dist', 'index.html')) || process.env.E2E_COMPILAR === '1') {
  const r = spawnSync('npm run build -w @mesa/web', { cwd: RAIZ, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(1);
}
const servidor = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: API, env: ENV, stdio: 'inherit' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => servidor.kill(s));
servidor.on('exit', (c) => process.exit(c ?? 0));
