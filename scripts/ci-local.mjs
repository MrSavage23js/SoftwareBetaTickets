#!/usr/bin/env node
// "CI local": los mismos pasos que debe pasar cualquier cambio antes de hacer commit.
// Uso: npm run ci            (lint, formato, tipos, pruebas, build)
import { spawnSync } from 'node:child_process';
import { RAIZ } from './env.mjs';

const pasos = [
  ['Lint', 'npm', ['run', 'lint']],
  ['Tipos', 'npm', ['run', 'typecheck']],
  ['Pruebas', 'npm', ['test']],
  ['Build', 'npm', ['run', 'build']],
];

const inicio = Date.now();
for (const [nombre, cmd, args] of pasos) {
  console.log(`\n\x1b[1m▶ ${nombre}\x1b[0m`);
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n\x1b[31m✖ Falló: ${nombre}\x1b[0m`);
    process.exit(r.status ?? 1);
  }
  console.log(`\x1b[32m✔ ${nombre}\x1b[0m (${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
console.log(`\n\x1b[32mTodo en verde\x1b[0m en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
