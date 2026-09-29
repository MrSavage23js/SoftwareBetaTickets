#!/usr/bin/env node
// Genera la DEMO para GitHub Pages en la carpeta demo-github-pages/:
// index.html en la raíz, rutas relativas y sin servidor (los datos viven en el navegador).
// Uso: npm run build:demo   → luego arrastra el CONTENIDO de demo-github-pages/ a tu repositorio.
import { spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './env.mjs';

const SALIDA = join(RAIZ, 'demo-github-pages');

const r = spawnSync(`npx vite build --mode demo --base ./ --outDir "${SALIDA}" --emptyOutDir`, {
  cwd: join(RAIZ, 'apps', 'web'),
  stdio: 'inherit',
  shell: true,
});
if (r.status !== 0) process.exit(r.status ?? 1);

// GitHub Pages: 404.html = la misma app (por si alguien abre una ruta directa) y sin procesamiento Jekyll.
copyFileSync(join(SALIDA, 'index.html'), join(SALIDA, '404.html'));
writeFileSync(join(SALIDA, '.nojekyll'), '');
// Sin README.md: si la demo se sube al mismo repositorio del código, no debe reemplazar el README del proyecto.

const archivos = readdirSync(SALIDA, { recursive: true }).length;
console.log(`\nDemo lista en demo-github-pages/ (${archivos} archivos).`);
console.log('Sube el CONTENIDO de esa carpeta a GitHub y activa Settings → Pages → Deploy from a branch → main / (root).');
