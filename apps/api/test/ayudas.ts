// Utilidades para las pruebas de API: reiniciar la BD, crear usuarios de prueba e iniciar sesión.
import { mkdirSync, rmSync } from 'node:fs';
import argon2 from 'argon2';
import { sql } from 'kysely';
import request from 'supertest';
import type { Express } from 'express';
import { anioEnZona, formatearFolio, ROLES } from '@mesa/shared';
import { crearApp } from '../src/app';
import { RUTAS } from '../src/config/env';
import { db } from '../src/db/conexion';
import { OPCIONES_ARGON2, sembrar } from '../src/db/seeds';
import { invalidarAjustes } from '../src/modulos/ajustes/servicio';
import { invalidarPermisos } from '../src/modulos/auth/sesiones';
import { usarTransporte } from '../src/modulos/correos/transportes';

export const PASSWORD = 'Prueba12345';

/** Año en curso en la zona del sistema (el folio lo usa). */
export const ANIO = anioEnZona(new Date(), 'America/Mexico_City');
/** Folio esperado: folio('SIS', 1) → SIS-2026-0001. */
export const folio = (departamento: string, n: number, anio = ANIO) => formatearFolio(departamento, anio, n);

const TABLAS = [
  'ticket_eventos',
  'adjuntos',
  'ticket_mensajes',
  'ticket_copias',
  'correos_salida',
  'tickets',
  'folio_contadores',
  'sesiones',
  'intentos_login',
  'auditoria',
  'usuario_empresas',
  'usuarios',
  'ajustes',
  'plantillas_correo',
  'rol_permisos',
  'permisos',
  'roles',
  'estatus_ticket',
  'modulos',
  'tipos_solicitud',
  'empresas',
  'departamentos',
];

let hash: string | undefined;

export interface Fixtures {
  deptoSIS: number;
  deptoRH: number;
  admin: number;
  tecnico: number;
  u1: number;
  u2: number;
  empresaAS: number;
  empresaMA: number;
  tipoCA: number;
  tipoCG: number;
  moduloCompras: number;
}

/** Deja la BD de pruebas como recién instalada + 4 usuarios de prueba. */
export async function reiniciarBD(): Promise<Fixtures> {
  // DELETE (mucho más rápido que TRUNCATE en tablas chicas) con llaves foráneas desactivadas, en la misma conexión.
  await db.connection().execute(async (c) => {
    await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(c);
    for (const t of TABLAS) await sql.raw(`DELETE FROM ${t}`).execute(c);
    await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(c);
  });
  invalidarAjustes();
  invalidarPermisos();
  usarTransporte(undefined);
  rmSync(RUTAS.storage, { recursive: true, force: true });
  for (const d of [RUTAS.adjuntos, RUTAS.correosConsola, RUTAS.temporales]) mkdirSync(d, { recursive: true });

  await sembrar();

  hash ??= await argon2.hash(PASSWORD, OPCIONES_ARGON2);
  const rol = async (codigo: string) => (await db.selectFrom('roles').select('id').where('codigo', '=', codigo).executeTakeFirstOrThrow()).id;
  const empresa = async (codigo: string) => (await db.selectFrom('empresas').select('id').where('codigo', '=', codigo).executeTakeFirstOrThrow()).id;
  const depto = async (codigo: string) => (await db.selectFrom('departamentos').select('id').where('codigo', '=', codigo).executeTakeFirstOrThrow()).id;
  const [deptoSIS, deptoRH] = [await depto('SIS'), await depto('RH')];
  const tipo = async (codigo: string) => (await db.selectFrom('tipos_solicitud').select('id').where('codigo', '=', codigo).executeTakeFirstOrThrow()).id;
  const [rolAdmin, rolUsuario, empresaAS, empresaMA] = await Promise.all([rol(ROLES.ADMIN_SOPORTE), rol(ROLES.USUARIO), empresa('AS'), empresa('MA')]);

  const crear = async (username: string, rolId: number, empresas: number[], departamentoId: number | null = null) => {
    const r = await db
      .insertInto('usuarios')
      .values({
        username,
        nombre: null,
        email: `${username}@prueba.local`,
        password_hash: hash!,
        rol_id: rolId,
        departamento_id: departamentoId,
        activo: 1,
        password_cambiado_at: new Date(),
        id_anterior: null,
      })
      .executeTakeFirstOrThrow();
    const id = Number(r.insertId);
    if (empresas.length) await db.insertInto('usuario_empresas').values(empresas.map((e) => ({ usuario_id: id, empresa_id: e }))).execute();
    return id;
  };

  return {
    admin: await crear('admin_prueba', rolAdmin, []),
    tecnico: await crear('tecnico_prueba', rolAdmin, []),
    u1: await crear('usuario_uno', rolUsuario, [empresaAS], deptoSIS),
    u2: await crear('usuario_dos', rolUsuario, [empresaMA], deptoRH),
    deptoSIS,
    deptoRH,
    empresaAS,
    empresaMA,
    tipoCA: await tipo('CA'),
    tipoCG: await tipo('CG'),
    moduloCompras: (await db.selectFrom('modulos').select('id').where('nombre', '=', 'Compras').executeTakeFirstOrThrow()).id,
  };
}

let app: Express | undefined;
export const aplicacion = () => (app ??= crearApp());

export interface Cliente {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  get: (ruta: string) => request.Test;
  post: (ruta: string, cuerpo?: object) => request.Test;
  put: (ruta: string, cuerpo: object) => request.Test;
  del: (ruta: string) => request.Test;
  /** POST multipart: campo "datos" (JSON) + archivos. */
  form: (ruta: string, datos: object, archivos?: { nombre: string; contenido: Buffer | string; tipo?: string }[]) => request.Test;
}

/** Inicia sesión y devuelve un cliente con cookie y token CSRF listos. */
export async function entrar(username: string, password = PASSWORD): Promise<Cliente> {
  const agente = request.agent(aplicacion());
  const r = await agente.post('/api/auth/login').send({ username, password });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${username}: ${r.status} ${JSON.stringify(r.body)}`);
  const csrf = r.body.csrfToken as string;
  return {
    agente,
    csrf,
    get: (ruta) => agente.get(`/api${ruta}`),
    post: (ruta, cuerpo = {}) => agente.post(`/api${ruta}`).set('X-CSRF-Token', csrf).send(cuerpo),
    put: (ruta, cuerpo) => agente.put(`/api${ruta}`).set('X-CSRF-Token', csrf).send(cuerpo),
    del: (ruta) => agente.delete(`/api${ruta}`).set('X-CSRF-Token', csrf),
    form: (ruta, datos, archivos = []) => {
      let q = agente.post(`/api${ruta}`).set('X-CSRF-Token', csrf).field('datos', JSON.stringify(datos));
      for (const a of archivos) q = q.attach('archivos', Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(a.contenido), { filename: a.nombre, contentType: a.tipo });
      return q;
    },
  };
}

export const anonimo = () => request(aplicacion());

/** Datos válidos de un ticket (Cancelación · Autotransportes Asturcones · Compras). */
export function ticketValido(f: Fixtures, extra: Record<string, unknown> = {}) {
  return {
    tipoId: f.tipoCA,
    departamentoId: f.deptoSIS,
    empresaId: f.empresaAS,
    moduloId: f.moduloCompras,
    concepto: 'CARTA PORTE',
    foliosRef: 'B12345',
    descripcionHtml: '<p>Cancelar la carta porte B12345.</p>',
    ...extra,
  };
}

/** PNG de 1×1 válido (para adjuntos). */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** PDF mínimo válido. */
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
