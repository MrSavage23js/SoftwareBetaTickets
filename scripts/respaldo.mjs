#!/usr/bin/env node
// Respaldo completo: datos de la base (volcado propio, ver bd-volcado.mjs) + carpeta de adjuntos + manifiesto.
// Funciona contra la base local o una remota (Render): toma DATABASE_URL de .env o del entorno.
// Borra respaldos más viejos que RESPALDOS_RETENCION_DIAS.
// Uso: npm run respaldo
// Programarlo: Programador de tareas de Windows o cron (ver README → Respaldos).
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { volcar } from './bd-volcado.mjs';
import { cargarEnv, RAIZ } from './env.mjs';

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
    if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
    const sql = join(carpeta, 'bd.jsonl.gz');
    const { conteo } = await volcar(env.DATABASE_URL, sql);
    console.log(`✔ Base de datos (${conteo.tickets ?? 0} tickets, ${conteo.usuarios ?? 0} usuarios)`);

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
          baseDatos: new URL(env.DATABASE_URL).pathname.slice(1),
          motor: 'postgresql',
          bd: { archivo: 'bd.jsonl.gz', bytes: (await stat(sql)).size, sha256: await sha256(sql), filas: conteo },
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
