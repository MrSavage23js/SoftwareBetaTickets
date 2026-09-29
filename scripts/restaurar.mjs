#!/usr/bin/env node
// Restaura un respaldo creado con scripts/respaldo.mjs.
// Uso:
//   npm run restaurar -- <carpeta-del-respaldo> --confirmar
//   npm run restaurar -- <carpeta> --bd otra_base --confirmar   (restaurar en otra base para verificar)
//   npm run restaurar -- <carpeta> --sin-adjuntos --confirmar
// ¡Reemplaza el contenido de la base de datos destino! Detén el servicio antes de restaurar la base principal.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';
import { binarioMysql, cargarEnv, RAIZ } from './env.mjs';

const env = cargarEnv();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { bd: { type: 'string' }, confirmar: { type: 'boolean' }, 'sin-adjuntos': { type: 'boolean' } },
});

const carpeta = positionals[0] && (isAbsolute(positionals[0]) ? positionals[0] : resolve(process.cwd(), positionals[0]));
if (!carpeta || !existsSync(join(carpeta, 'manifiesto.json'))) {
  console.error('Indica la carpeta de un respaldo válido (debe contener manifiesto.json).');
  process.exit(1);
}
const manifiesto = JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8'));
const destino = values.bd ?? env.DB_NAME;

if (!values.confirmar) {
  console.log(`Se restaurará el respaldo del ${manifiesto.fecha} en la base "${destino}" (su contenido actual se REEMPLAZA).`);
  console.log('Vuelve a ejecutar agregando --confirmar para continuar.');
  process.exit(1);
}

function sha256(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal);
  });
}

function mysql(args, entrada) {
  const hijo = spawn(binarioMysql('mysql'), [`--host=${env.DB_HOST}`, `--port=${env.DB_PORT}`, `--user=${env.DB_USER}`, '--default-character-set=utf8mb4', ...args], {
    env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD ?? '' },
    stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  let error = '';
  hijo.stdout.on('data', (d) => (salida += d));
  hijo.stderr.on('data', (d) => (error += d));
  const fin = new Promise((ok, mal) => {
    hijo.on('error', mal);
    hijo.on('close', (c) => (c === 0 ? ok(salida) : mal(new Error(error.trim() || `mysql terminó con código ${c}`))));
  });
  return { hijo, fin };
}

const sql = join(carpeta, manifiesto.bd.archivo);
if ((await sha256(sql)) !== manifiesto.bd.sha256) {
  console.error('✖ El archivo de la base de datos no coincide con el manifiesto (está dañado o fue modificado).');
  process.exit(1);
}
console.log('✔ Integridad verificada');

await mysql(['-e', `CREATE DATABASE IF NOT EXISTS \`${destino.replaceAll('`', '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`]).fin;
const carga = mysql([destino], true);
await Promise.all([pipeline(createReadStream(sql), createGunzip(), carga.hijo.stdin), carga.fin]);
console.log(`✔ Base de datos restaurada en "${destino}"`);

const conteo = await mysql(['-N', '-e', 'SELECT (SELECT COUNT(*) FROM tickets), (SELECT COUNT(*) FROM usuarios), (SELECT COUNT(*) FROM adjuntos)', destino]).fin;
const [tickets, usuarios, adjuntos] = conteo.trim().split(/\s+/);
console.log(`  tickets: ${tickets} · usuarios: ${usuarios} · adjuntos registrados: ${adjuntos}`);

if (!values['sin-adjuntos'] && existsSync(join(carpeta, 'adjuntos'))) {
  const storage = isAbsolute(env.STORAGE_DIR ?? '') ? env.STORAGE_DIR : resolve(RAIZ, env.STORAGE_DIR ?? './storage');
  await cp(join(carpeta, 'adjuntos'), join(storage, 'adjuntos'), { recursive: true, force: true });
  console.log(`✔ Adjuntos restaurados (${manifiesto.adjuntos.archivos} archivos)`);
}
console.log('Restauración completa. Inicia el servicio y revisa /health.');
