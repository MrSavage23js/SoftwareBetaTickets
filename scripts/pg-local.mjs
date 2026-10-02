#!/usr/bin/env node
// PostgreSQL portátil para desarrollo, sin Docker ni instalador: los binarios oficiales vienen en el
// paquete npm `embedded-postgres` (dependencia de desarrollo).
// Uso: npm run db:local -- <instalar|iniciar|detener|estado>
// Los datos viven en %LOCALAPPDATA%\mesa-ayuda\pg-datos (fuera de OneDrive, que corrompe los archivos de datos).
// Usuario, contraseña, puerto y bases se toman de DATABASE_URL en .env (la de pruebas: <base>_test).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { cargarEnv, RAIZ } from './env.mjs';

const env = cargarEnv();
const BASE = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '.', '.local'), 'mesa-ayuda');
const DIR_DATOS = join(BASE, 'pg-datos');
const LOG = join(BASE, 'pg.log');

if (!env.DATABASE_URL) {
  console.log('Falta DATABASE_URL en .env (p. ej. postgresql://mesa_app:mesa_dev_123@127.0.0.1:5433/mesa_ayuda).');
  process.exit(1);
}
const url = new URL(env.DATABASE_URL);
const PUERTO = Number(url.port || 5432);
const USUARIO = decodeURIComponent(url.username || 'mesa_app');
const PASS = decodeURIComponent(url.password || 'mesa_dev_123');
const BD = decodeURIComponent(url.pathname.replace(/^\//, ''));
const BD_PRUEBAS = env.DATABASE_URL_TEST ? decodeURIComponent(new URL(env.DATABASE_URL_TEST).pathname.slice(1)) : `${BD}_test`;

function dirBinarios() {
  const plataforma = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const paquete = `@embedded-postgres/${plataforma}-${process.arch}`;
  const dir = join(RAIZ, 'node_modules', ...paquete.split('/'), 'native', 'bin');
  if (!existsSync(dir)) {
    console.log(`No encontré ${paquete}. Ejecuta npm install (es una dependencia de desarrollo).`);
    process.exit(1);
  }
  return dir;
}
const DIR_BIN = dirBinarios();
const bin = (n) => join(DIR_BIN, process.platform === 'win32' ? `${n}.exe` : n);

function puertoAbierto(puerto) {
  return new Promise((ok) => {
    const s = net.connect(puerto, '127.0.0.1');
    s.once('connect', () => (s.destroy(), ok(true)));
    s.once('error', () => ok(false));
  });
}

async function esperarPuerto(puerto, ms = 60_000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await puertoAbierto(puerto)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`PostgreSQL no respondió en el puerto ${puerto}. Revisa ${LOG}`);
}

/** Ejecuta SQL como superusuario local (postgres) usando el cliente `pg` del proyecto. */
async function comoAdmin(base, sentencias) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ host: '127.0.0.1', port: PUERTO, user: 'postgres', password: PASS, database: base });
  await c.connect();
  try {
    for (const s of sentencias) await c.query(s);
  } finally {
    await c.end();
  }
}
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const ident = (s) => `"${s.replaceAll('"', '""')}"`;

async function instalar() {
  mkdirSync(BASE, { recursive: true });
  if (!existsSync(join(DIR_DATOS, 'PG_VERSION'))) {
    console.log('Inicializando directorio de datos…');
    const pwfile = join(BASE, 'pg-pass.tmp');
    writeFileSync(pwfile, PASS);
    // Intercalación ICU por omisión: ordena como una persona (sin separar mayúsculas de minúsculas).
    const r = spawnSync(
      bin('initdb'),
      ['-D', DIR_DATOS, '-U', 'postgres', `--pwfile=${pwfile}`, '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C', '--locale-provider=icu', '--icu-locale=und'],
      { stdio: 'inherit' },
    );
    rmSync(pwfile, { force: true });
    if (r.status !== 0) throw new Error('Falló la inicialización de PostgreSQL');
  }
  await iniciar();
  const existe = async (rol) => {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ host: '127.0.0.1', port: PUERTO, user: 'postgres', password: PASS, database: 'postgres' });
    await c.connect();
    const r = await c.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [rol]);
    const bases = await c.query(`SELECT datname FROM pg_database`);
    await c.end();
    return { rol: r.rowCount > 0, bases: new Set(bases.rows.map((b) => b.datname)) };
  };
  const hay = await existe(USUARIO);
  const sentencias = [];
  if (!hay.rol) sentencias.push(`CREATE ROLE ${ident(USUARIO)} LOGIN PASSWORD ${literal(PASS)}`);
  // La aplicación es dueña de sus bases: así puede crear la extensión unaccent en la migración (igual que en Render).
  for (const b of [BD, BD_PRUEBAS]) if (!hay.bases.has(b)) sentencias.push(`CREATE DATABASE ${ident(b)} OWNER ${ident(USUARIO)} ENCODING 'UTF8'`);
  await comoAdmin('postgres', sentencias);
  console.log(`Listo. PostgreSQL en 127.0.0.1:${PUERTO}, usuario ${USUARIO}, bases ${BD} y ${BD_PRUEBAS}.`);
}

async function iniciar() {
  if (await puertoAbierto(PUERTO)) {
    console.log(`PostgreSQL ya está corriendo en el puerto ${PUERTO}.`);
    return;
  }
  if (!existsSync(join(DIR_DATOS, 'PG_VERSION'))) {
    console.log('PostgreSQL no está inicializado. Ejecuta: npm run db:local -- instalar');
    process.exit(1);
  }
  const opciones = `-p ${PUERTO} -c listen_addresses=127.0.0.1 -c max_connections=200`;
  if (process.platform === 'win32') {
    // Start-Process deja a PostgreSQL fuera del grupo de procesos de la terminal: sigue vivo al cerrarla.
    const ps = `Start-Process -FilePath '${bin('pg_ctl')}' -ArgumentList 'start','-D','"${DIR_DATOS}"','-l','"${LOG}"','-o','"${opciones}"' -WindowStyle Hidden -Wait`;
    // El código de salida de Start-Process no es confiable: se confirma esperando el puerto.
    spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  } else {
    const r = spawnSync(bin('pg_ctl'), ['start', '-D', DIR_DATOS, '-l', LOG, '-o', opciones], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`No se pudo iniciar PostgreSQL. Revisa ${LOG}`);
  }
  await esperarPuerto(PUERTO);
  console.log(`PostgreSQL iniciado en el puerto ${PUERTO}.`);
}

async function detener() {
  if (!(await puertoAbierto(PUERTO))) return console.log('PostgreSQL no está corriendo.');
  spawnSync(bin('pg_ctl'), ['stop', '-D', DIR_DATOS, '-m', 'fast'], { stdio: 'inherit' });
  console.log('PostgreSQL detenido.');
}

async function estado() {
  const arriba = await puertoAbierto(PUERTO);
  const version = existsSync(join(DIR_DATOS, 'PG_VERSION')) ? readFileSync(join(DIR_DATOS, 'PG_VERSION'), 'utf8').trim() : null;
  console.log(`Binarios: ${DIR_BIN}`);
  console.log(`Datos:    ${version ? `${DIR_DATOS} (PostgreSQL ${version})` : 'sin inicializar'}`);
  console.log(`Puerto ${PUERTO}: ${arriba ? 'escuchando' : 'cerrado'}`);
}

const acciones = { instalar, iniciar, detener, estado };
const accion = acciones[process.argv[2] ?? 'estado'];
if (!accion) {
  console.log('Uso: npm run db:local -- <instalar|iniciar|detener|estado>');
  process.exit(1);
}
accion().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
