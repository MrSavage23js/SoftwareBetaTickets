#!/usr/bin/env node
// Respaldo de la base de PRODUCCIÓN a esta PC (pensado para correr a diario desde el Programador de tareas).
// Uso: npm run respaldo:produccion
//
// De dónde toma la base (en .env):
//   RESPALDO_DATABASE_URL=postgresql://…   → se usa tal cual (p. ej. Neon). Tiene prioridad.
//   RENDER_API_KEY + RESPALDO_RENDER_DB=dpg-…  → pide a Render la cadena externa y, como la IP de esta PC
//                                              cambia, la agrega antes a la lista de IPs permitidas de la base.
// Guarda en RESPALDO_PRODUCCION_DIR (por defecto storage/respaldos-produccion), conserva 30 días
// (RESPALDOS_RETENCION_DIAS) y anota cada corrida en respaldo.log dentro de esa carpeta.
// No copia los adjuntos locales: los de producción viven en el disco de Render y no se pueden respaldar así.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { cargarEnv, RAIZ } from './env.mjs';

const env = cargarEnv();
const abs = (p) => (isAbsolute(p) ? p : resolve(RAIZ, p));
const DESTINO = abs(env.RESPALDO_PRODUCCION_DIR ?? './storage/respaldos-produccion');
const LOG = join(DESTINO, 'respaldo.log');
const ETIQUETA_IP = 'Respaldo automatico (PC sistemas)';

mkdirSync(DESTINO, { recursive: true });
function log(msg) {
  const linea = `[${new Date().toLocaleString('es-MX')}] ${msg}`;
  console.log(linea);
  appendFileSync(LOG, linea + '\n');
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(ruta, opciones = {}) {
  const res = await fetch(`https://api.render.com/v1${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${env.RENDER_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Render ${opciones.method ?? 'GET'} ${ruta}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function urlDesdeRender() {
  const id = env.RESPALDO_RENDER_DB;
  if (!env.RENDER_API_KEY || !id) throw new Error('Falta RESPALDO_DATABASE_URL, o RENDER_API_KEY + RESPALDO_RENDER_DB, en .env');
  const bd = await render(`/postgres/${id}`);
  if (bd.status !== 'available') throw new Error(`La base ${bd.name} no está disponible (estado: ${bd.status}, caduca: ${bd.expiresAt ?? 'nunca'})`);
  if (bd.expiresAt) {
    const dias = Math.floor((new Date(bd.expiresAt) - Date.now()) / 86_400_000);
    if (dias <= 7) log(`⚠ AVISO: la base de Render caduca en ${dias} días (${bd.expiresAt}). Hay que migrarla antes.`);
  }

  const ip = (await (await fetch('https://api.ipify.org')).text()).trim();
  const lista = bd.ipAllowList ?? [];
  if (!lista.some((e) => e.cidrBlock === `${ip}/32`)) {
    const nueva = [...lista.filter((e) => e.description !== ETIQUETA_IP), { cidrBlock: `${ip}/32`, description: ETIQUETA_IP }];
    await render(`/postgres/${id}`, { method: 'PATCH', body: JSON.stringify({ ipAllowList: nueva }) });
    log(`IP ${ip} agregada a las permitidas de la base`);
    await esperar(20_000); // Render tarda unos segundos en aplicar la lista
  }
  const info = await render(`/postgres/${id}/connection-info`);
  return `${info.externalConnectionString}?sslmode=require`;
}

async function main() {
  const url = env.RESPALDO_DATABASE_URL || (await urlDesdeRender());
  const vacio = join(RAIZ, 'storage', 'tmp', 'respaldo-sin-adjuntos');
  rmSync(vacio, { recursive: true, force: true });
  mkdirSync(vacio, { recursive: true });

  // Hasta 3 intentos: el servidor de Render o la lista de IPs a veces tardan en responder.
  for (let intento = 1; intento <= 3; intento++) {
    const r = spawnSync(process.execPath, ['--no-warnings', join(RAIZ, 'scripts', 'respaldo.mjs')], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: url, STORAGE_DIR: vacio, RESPALDOS_DIR: DESTINO },
      encoding: 'utf8',
    });
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/postgres(ql)?:\/\/\S+/g, '<url>').trim();
    if (r.status === 0) {
      log(`✔ ${salida.split('\n').filter((l) => l.startsWith('✔') || l.startsWith('Respaldo en') || l.startsWith('Respaldos viejos')).join(' | ')}`);
      return;
    }
    log(`✖ Intento ${intento} falló: ${salida.split('\n').pop()}`);
    if (intento < 3) await esperar(30_000);
  }
  process.exit(1);
}

main().catch((e) => {
  log(`✖ Falló el respaldo: ${e.message}`);
  process.exit(1);
});
