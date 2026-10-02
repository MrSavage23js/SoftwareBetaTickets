#!/usr/bin/env node
// Restaura un respaldo creado con scripts/respaldo.mjs.
// Uso:
//   npm run restaurar -- <carpeta-del-respaldo> --confirmar
//   npm run restaurar -- <carpeta> --bd otra_base --confirmar     (otra base del mismo servidor, p. ej. para verificar)
//   npm run restaurar -- <carpeta> --url postgresql://… --confirmar  (otro servidor, p. ej. una base nueva en Render)
//   npm run restaurar -- <carpeta> --sin-adjuntos --confirmar
// ¡Reemplaza el contenido de la base de datos destino! Detén el servicio antes de restaurar la base principal.
// La base destino debe existir (en Render se crea desde su panel); el esquema lo crean las migraciones.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cargar } from './bd-volcado.mjs';
import { cargarEnv, RAIZ } from './env.mjs';

const env = cargarEnv();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { bd: { type: 'string' }, url: { type: 'string' }, confirmar: { type: 'boolean' }, 'sin-adjuntos': { type: 'boolean' } },
});

const carpeta = positionals[0] && (isAbsolute(positionals[0]) ? positionals[0] : resolve(process.cwd(), positionals[0]));
if (!carpeta || !existsSync(join(carpeta, 'manifiesto.json'))) {
  console.error('Indica la carpeta de un respaldo válido (debe contener manifiesto.json).');
  process.exit(1);
}
const manifiesto = JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8'));
if (manifiesto.motor !== 'postgresql') {
  console.error('Este respaldo es del sistema anterior con MySQL (bd.sql.gz) y no se puede cargar en PostgreSQL.');
  process.exit(1);
}

const destino = new URL(values.url ?? env.DATABASE_URL ?? '');
if (values.bd) destino.pathname = `/${values.bd}`;
const nombreDestino = `${destino.hostname}/${destino.pathname.slice(1)}`;

if (!values.confirmar) {
  console.log(`Se restaurará el respaldo del ${manifiesto.fecha} en "${nombreDestino}" (su contenido actual se REEMPLAZA).`);
  console.log('Vuelve a ejecutar agregando --confirmar para continuar.');
  process.exit(1);
}

function sha256(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal);
  });
}

const archivo = join(carpeta, manifiesto.bd.archivo);
if ((await sha256(archivo)) !== manifiesto.bd.sha256) {
  console.error('✖ El archivo de la base de datos no coincide con el manifiesto (está dañado o fue modificado).');
  process.exit(1);
}
console.log('✔ Integridad verificada');

// Esquema al día en la base destino, con las migraciones del propio sistema (compiladas o desde el código).
const API = join(RAIZ, 'apps', 'api');
const cli = existsSync(join(API, 'dist', 'cli.js')) ? ['dist/cli.js'] : ['--import', 'tsx', 'src/db/cli.ts'];
const mig = spawnSync(process.execPath, [...cli, 'migrar'], {
  cwd: API,
  // Solo migra: lo demás de la configuración no importa, pero debe ser válido aunque no haya .env.
  env: {
    ...process.env,
    DATABASE_URL: destino.toString(),
    NODE_ENV: 'development',
    LOG_LEVEL: 'warn',
    APP_URL: 'http://localhost',
    MAIL_TRANSPORT: 'consola',
    MAIL_FROM: env.MAIL_FROM || 'respaldo@localhost',
  },
  stdio: 'inherit',
});
if (mig.status !== 0) {
  console.error('✖ No se pudieron aplicar las migraciones en la base destino.');
  process.exit(1);
}
console.log('✔ Esquema al día');

try {
  const conteo = await cargar(destino.toString(), archivo);
  console.log(`✔ Base de datos restaurada en "${nombreDestino}"`);
  console.log(`  tickets: ${conteo.tickets ?? 0} · usuarios: ${conteo.usuarios ?? 0} · adjuntos registrados: ${conteo.adjuntos ?? 0}`);
} catch (e) {
  console.error(`✖ Falló la carga (la base destino quedó como estaba): ${e.message}`);
  process.exit(1);
}

if (!values['sin-adjuntos'] && existsSync(join(carpeta, 'adjuntos'))) {
  const storage = isAbsolute(env.STORAGE_DIR ?? '') ? env.STORAGE_DIR : resolve(RAIZ, env.STORAGE_DIR ?? './storage');
  await cp(join(carpeta, 'adjuntos'), join(storage, 'adjuntos'), { recursive: true, force: true });
  console.log(`✔ Adjuntos restaurados (${manifiesto.adjuntos.archivos} archivos)`);
}
console.log('Restauración completa. Inicia el servicio y revisa /health.');
