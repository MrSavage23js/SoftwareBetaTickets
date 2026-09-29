#!/usr/bin/env node
// Respaldo completo: base de datos (mysqldump comprimido) + carpeta de adjuntos + manifiesto.
// Borra respaldos más viejos que RESPALDOS_RETENCION_DIAS.
// Uso: npm run respaldo
// Programarlo: Programador de tareas de Windows o cron (ver README → Respaldos).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { binarioMysql, cargarEnv, RAIZ } from './env.mjs';

const env = cargarEnv();
const abs = (p) => (isAbsolute(p) ? p : resolve(RAIZ, p));
const STORAGE = abs(env.STORAGE_DIR ?? './storage');
const DESTINO = abs(env.RESPALDOS_DIR ?? './storage/respaldos');
const RETENCION = Number(env.RESPALDOS_RETENCION_DIAS ?? 30);


function sha256(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal);
  });
}

async function volcarBD(archivo) {
  const args = [
    `--host=${env.DB_HOST}`,
    `--port=${env.DB_PORT}`,
    `--user=${env.DB_USER}`,
    '--single-transaction', // copia consistente sin bloquear el sistema
    '--quick',
    '--routines',
    '--triggers',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
    '--default-character-set=utf8mb4',
    '--hex-blob',
    env.DB_NAME,
  ];
  // La contraseña va por variable de entorno, no en la línea de comandos (no queda visible en procesos).
  const hijo = spawn(binarioMysql('mysqldump'), args, { env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD ?? '' } });
  let error = '';
  hijo.stderr.on('data', (d) => (error += d));
  const terminado = new Promise((ok, mal) => {
    hijo.on('error', mal);
    hijo.on('close', (c) => (c === 0 ? ok() : mal(new Error(`mysqldump terminó con código ${c}: ${error.trim()}`))));
  });
  await Promise.all([pipeline(hijo.stdout, createGzip({ level: 6 }), createWriteStream(archivo)), terminado]);
}

async function contarArchivos(dir) {
  if (!existsSync(dir)) return { archivos: 0, bytes: 0 };
  let archivos = 0;
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) {
      archivos++;
      bytes += (await stat(join(e.parentPath ?? e.path, e.name))).size;
    }
  }
  return { archivos, bytes };
}

async function limpiarViejos() {
  if (!existsSync(DESTINO)) return [];
  const limite = Date.now() - RETENCION * 86_400_000;
  const borrados = [];
  for (const e of await readdir(DESTINO, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name)) continue;
    const s = await stat(join(DESTINO, e.name));
    if (s.mtimeMs < limite) {
      await rm(join(DESTINO, e.name), { recursive: true, force: true });
      borrados.push(e.name);
    }
  }
  return borrados;
}

async function main() {
  const ahora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nombre = `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}_${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
  const carpeta = join(DESTINO, nombre);
  await mkdir(carpeta, { recursive: true });
  console.log(`Respaldo en ${carpeta}`);

  try {
    const sql = join(carpeta, 'bd.sql.gz');
    await volcarBD(sql);
    console.log('✔ Base de datos');

    const origenAdj = join(STORAGE, 'adjuntos');
    if (existsSync(origenAdj)) await cp(origenAdj, join(carpeta, 'adjuntos'), { recursive: true });
    const adj = await contarArchivos(join(carpeta, 'adjuntos'));
    console.log(`✔ Adjuntos (${adj.archivos} archivos)`);

    await writeFile(
      join(carpeta, 'manifiesto.json'),
      JSON.stringify(
        {
          sistema: 'mesa-de-ayuda',
          fecha: ahora.toISOString(),
          baseDatos: env.DB_NAME,
          bd: { archivo: 'bd.sql.gz', bytes: (await stat(sql)).size, sha256: await sha256(sql) },
          adjuntos: adj,
        },
        null,
        2,
      ),
    );
    const borrados = await limpiarViejos();
    if (borrados.length) console.log(`Respaldos viejos eliminados (> ${RETENCION} días): ${borrados.join(', ')}`);
    console.log('Respaldo completo.');
  } catch (e) {
    // Un respaldo a medias no sirve: se elimina para que nadie lo use por error.
    await rm(carpeta, { recursive: true, force: true });
    console.error(`✖ Falló el respaldo: ${e.message}`);
    process.exit(1);
  }
}

await main();
