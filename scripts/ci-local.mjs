#!/usr/bin/env node
// "CI local": los pasos que debe pasar cualquier cambio antes de hacer commit.
// Uso:
//   npm run ci              lint, tipos, pruebas unitarias y de API, auditoría de dependencias, build
//   npm run ci -- --e2e     además los recorridos completos en navegador (Playwright)
// Requiere MySQL encendido (npm run db:local -- iniciar): las pruebas usan la BD de pruebas.
import { spawnSync } from 'node:child_process';
import { RAIZ } from './env.mjs';

const conE2E = process.argv.includes('--e2e');
const pasos = [
  ['Lint', 'npm run lint'],
  ['Tipos', 'npm run typecheck'],
  ['Pruebas unitarias y de API', 'npm test'],
  ['Dependencias de producción sin vulnerabilidades altas', 'npm audit --omit=dev --audit-level=high'],
  ['Build', 'npm run build'],
  ...(conE2E ? [['Recorridos en navegador (Playwright)', 'npx playwright test']] : []),
];

const inicio = Date.now();
for (const [nombre, comando] of pasos) {
  console.log(`\n\x1b[1m▶ ${nombre}\x1b[0m`);
  const t = Date.now();
  const r = spawnSync(comando, { cwd: RAIZ, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n\x1b[31m✖ Falló: ${nombre}\x1b[0m`);
    process.exit(r.status ?? 1);
  }
  console.log(`\x1b[32m✔ ${nombre}\x1b[0m (${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
console.log(`\n\x1b[32mTodo en verde\x1b[0m en ${((Date.now() - inicio) / 1000).toFixed(1)} s${conE2E ? '' : '  (agrega --e2e para los recorridos en navegador)'}`);
