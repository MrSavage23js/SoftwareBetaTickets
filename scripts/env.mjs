// Lectura mínima de .env para los scripts (sin dependencias). La API usa su propio validador con zod.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export function cargarEnv(archivo = join(RAIZ, '.env')) {
  const valores = {};
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      valores[m[1]] = v;
    }
  }
  return { ...valores, ...process.env };
}

/** Ruta de mysql/mysqldump: variable de .env, MySQL portátil de desarrollo o el PATH. */
export function binarioMysql(nombre) {
  const env = cargarEnv();
  const explicito = nombre === 'mysqldump' ? env.MYSQLDUMP_BIN : env.MYSQL_BIN;
  if (explicito) return explicito;
  // MySQL portátil de desarrollo (scripts/mysql-local.mjs).
  if (process.env.LOCALAPPDATA) {
    const portatil = join(process.env.LOCALAPPDATA, 'mesa-ayuda', 'mysql-8.4.11-winx64', 'bin', `${nombre}.exe`);
    if (existsSync(portatil)) return portatil;
  }
  return nombre; // se busca en el PATH
}
