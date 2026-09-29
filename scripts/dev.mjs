#!/usr/bin/env node
// Levanta API (:3100, con recarga) y web (:5180, con Vite) juntas. Ctrl+C detiene ambas.
import { spawn } from 'node:child_process';
import { RAIZ } from './env.mjs';

const procesos = [
  { nombre: 'api', color: '\x1b[36m', args: ['run', 'dev', '-w', '@mesa/api'] },
  { nombre: 'web', color: '\x1b[35m', args: ['run', 'dev', '-w', '@mesa/web'] },
].map((p) => {
  const hijo = spawn('npm', p.args, { cwd: RAIZ, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const escribir = (d) =>
    String(d)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => process.stdout.write(`${p.color}[${p.nombre}]\x1b[0m ${l}\n`));
  hijo.stdout.on('data', escribir);
  hijo.stderr.on('data', escribir);
  hijo.on('exit', (c) => {
    console.log(`[${p.nombre}] terminó (${c})`);
    detener();
  });
  return hijo;
});

let deteniendo = false;
function detener() {
  if (deteniendo) return;
  deteniendo = true;
  for (const h of procesos) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' });
    else h.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
console.log('Web: http://localhost:5180  ·  API: http://localhost:3100');
