#!/usr/bin/env node
// MySQL portátil para desarrollo en Windows, sin Docker ni instalador.
// Uso: npm run db:local -- <instalar|iniciar|detener|estado>
// Binarios y datos viven en %LOCALAPPDATA%\mesa-ayuda (fuera de OneDrive, que corrompe los archivos de datos).
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import net from 'node:net';
import { cargarEnv } from './env.mjs';

const VERSION = '8.4.11';
const ZIP = `mysql-${VERSION}-winx64.zip`;
const URLS = [
  `https://cdn.mysql.com/Downloads/MySQL-8.4/${ZIP}`,
  `https://cdn.mysql.com/archives/mysql-8.4/${ZIP}`,
];

const env = cargarEnv();
const BASE = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '.', '.local'), 'mesa-ayuda');
const DIR_BIN = join(BASE, `mysql-${VERSION}-winx64`);
const DIR_DATOS = join(BASE, 'mysql-datos');
const INI = join(BASE, 'my.ini');
const PUERTO = Number(env.DB_PORT ?? 3307);
const bin = (n) => join(DIR_BIN, 'bin', `${n}.exe`);

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
  throw new Error(`MySQL no respondió en el puerto ${puerto}`);
}

async function descargar() {
  const destino = join(BASE, ZIP);
  if (existsSync(destino)) return destino;
  for (const url of URLS) {
    console.log(`Descargando ${url} …`);
    const r = await fetch(url);
    if (!r.ok) continue;
    await pipeline(Readable.fromWeb(r.body), createWriteStream(destino + '.part'));
    spawnSync('cmd', ['/c', 'move', '/y', destino + '.part', destino], { stdio: 'ignore' });
    return destino;
  }
  throw new Error('No se pudo descargar MySQL');
}

function mysql(sql) {
  const r = spawnSync(bin('mysql'), ['-uroot', '-h127.0.0.1', `-P${PUERTO}`, '-e', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

async function instalar() {
  if (process.platform !== 'win32') {
    console.log('Este script es para Windows. En Linux/macOS usa docker compose (docker/docker-compose.yml).');
    process.exit(1);
  }
  mkdirSync(BASE, { recursive: true });
  if (!existsSync(bin('mysqld'))) {
    const zip = await descargar();
    console.log('Descomprimiendo…');
    // El tar.exe de Windows (bsdtar) entiende ZIP y rutas "C:\"; el tar de Git Bash no.
    const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    const r = spawnSync(tar, ['-xf', zip, '-C', BASE], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('No se pudo descomprimir el ZIP');
  }
  writeFileSync(
    INI,
    [
      '[mysqld]',
      `basedir=${DIR_BIN.replaceAll('\\', '/')}`,
      `datadir=${DIR_DATOS.replaceAll('\\', '/')}`,
      `port=${PUERTO}`,
      'bind-address=127.0.0.1',
      'mysqlx=OFF',
      'character-set-server=utf8mb4',
      'collation-server=utf8mb4_0900_ai_ci',
      "default-time-zone='+00:00'",
      'innodb_buffer_pool_size=256M',
      'max_connections=200',
      '',
    ].join('\n'),
  );
  if (!existsSync(DIR_DATOS)) {
    console.log('Inicializando directorio de datos…');
    const r = spawnSync(bin('mysqld'), [`--defaults-file=${INI}`, '--initialize-insecure', '--console'], {
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('Falló la inicialización de MySQL');
  }
  await iniciar();
  const usuario = env.DB_USER ?? 'mesa_app';
  const pass = (env.DB_PASSWORD ?? 'mesa_dev_123').replaceAll("'", "''");
  mysql(
    [
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME ?? 'mesa_ayuda'}\``,
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME_TEST ?? 'mesa_ayuda_test'}\``,
      `CREATE USER IF NOT EXISTS '${usuario}'@'localhost' IDENTIFIED BY '${pass}'`,
      `CREATE USER IF NOT EXISTS '${usuario}'@'127.0.0.1' IDENTIFIED BY '${pass}'`,
      `GRANT ALL PRIVILEGES ON \`${env.DB_NAME ?? 'mesa_ayuda'}\`.* TO '${usuario}'@'localhost', '${usuario}'@'127.0.0.1'`,
      `GRANT ALL PRIVILEGES ON \`${env.DB_NAME_TEST ?? 'mesa_ayuda_test'}\`.* TO '${usuario}'@'localhost', '${usuario}'@'127.0.0.1'`,
      // PROCESS y RELOAD los necesita mysqldump para respaldos consistentes.
      `GRANT PROCESS, RELOAD ON *.* TO '${usuario}'@'localhost', '${usuario}'@'127.0.0.1'`,
      'FLUSH PRIVILEGES',
    ].join(';'),
  );
  console.log(`Listo. MySQL ${VERSION} en 127.0.0.1:${PUERTO}, usuario ${usuario}.`);
}

async function iniciar() {
  if (await puertoAbierto(PUERTO)) {
    console.log(`MySQL ya está corriendo en el puerto ${PUERTO}.`);
    return;
  }
  if (!existsSync(bin('mysqld'))) {
    console.log('MySQL no está instalado. Ejecuta: npm run db:local -- instalar');
    process.exit(1);
  }
  // Start-Process deja a mysqld fuera del grupo de procesos de la terminal: sigue vivo al cerrarla.
  const ps = `$p = Start-Process -FilePath '${bin('mysqld')}' -ArgumentList '--defaults-file="${INI}"' -WindowStyle Hidden -PassThru; $p.Id`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`No se pudo iniciar MySQL: ${r.stderr}`);
  writeFileSync(join(BASE, 'mysqld.pid'), r.stdout.trim());
  await esperarPuerto(PUERTO);
  console.log(`MySQL iniciado en el puerto ${PUERTO}.`);
}

async function detener() {
  if (!(await puertoAbierto(PUERTO))) return console.log('MySQL no está corriendo.');
  spawnSync(bin('mysqladmin'), ['-uroot', '-h127.0.0.1', `-P${PUERTO}`, 'shutdown'], { stdio: 'inherit' });
  console.log('MySQL detenido.');
}

async function estado() {
  const arriba = await puertoAbierto(PUERTO);
  console.log(`Binarios: ${existsSync(bin('mysqld')) ? DIR_BIN : 'no instalados'}`);
  console.log(`Datos:    ${existsSync(DIR_DATOS) ? DIR_DATOS : 'sin inicializar'}`);
  console.log(`Puerto ${PUERTO}: ${arriba ? 'escuchando' : 'cerrado'}`);
  if (existsSync(join(BASE, 'mysqld.pid'))) console.log(`PID: ${readFileSync(join(BASE, 'mysqld.pid'), 'utf8')}`);
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
