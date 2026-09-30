// Publica el sistema que corre en esta PC con un enlace https temporal (túnel gratuito de Cloudflare),
// para que alguien de fuera (p. ej. QA) lo pruebe. Uso: npm run tunel   (Ctrl+C para detener todo)
//
// - Necesita cloudflared.exe en %LOCALAPPDATA%\mesa-ayuda (o en el PATH) y la base de datos iniciada.
// - El enlace cambia cada vez que se ejecuta y solo funciona mientras esta ventana siga abierta.
// - Arranca el servidor en modo producción (cookies seguras, APP_URL = el enlace) con la compilación
//   actual: corre `npm run build` antes si hubo cambios.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PUERTO = process.env.PORT ?? '3100';
const local = join(process.env.LOCALAPPDATA ?? '', 'mesa-ayuda', 'cloudflared.exe');
const cloudflared = existsSync(local) ? local : 'cloudflared';
const raiz = join(import.meta.dirname, '..');

const tunel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PUERTO}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunel.on('error', () => {
  console.error('No encontré cloudflared. Descárgalo de https://github.com/cloudflare/cloudflared/releases (cloudflared-windows-amd64.exe)');
  console.error(`y guárdalo como ${local}`);
  process.exit(1);
});

let servidor = null;
const detener = () => {
  servidor?.kill();
  tunel.kill();
  process.exit(0);
};
process.on('SIGINT', detener);
process.on('SIGTERM', detener);

const buscarEnlace = (trozo) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(trozo.toString())?.[0];
  if (!url || servidor) return;
  servidor = spawn(process.execPath, ['dist/server.js'], {
    cwd: join(raiz, 'apps', 'api'),
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production', COOKIE_SECURE: 'true', TRUST_PROXY: '1', APP_URL: url, PORT: PUERTO },
  });
  servidor.on('exit', (codigo) => {
    console.error(`El servidor terminó (código ${codigo}). ¿Está libre el puerto ${PUERTO} y la base de datos iniciada?`);
    detener();
  });
  console.log(`\n  Enlace para compartir:  ${url}\n  (espera unos segundos a que cargue; Ctrl+C para detener)\n`);
};
tunel.stdout.on('data', buscarEnlace);
tunel.stderr.on('data', buscarEnlace);
