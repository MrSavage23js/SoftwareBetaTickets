// Seeds idempotentes: se pueden correr muchas veces. Solo insertan lo que falta y
// nunca pisan lo que se editó desde la interfaz (catálogos, plantillas, ajustes, permisos de un rol).
import argon2 from 'argon2';
import {
  DEFINICION_AJUSTES,
  DESCRIPCION_PERMISOS,
  INFO_ESTATUS,
  LISTA_ESTATUS,
  PERMISOS_INICIALES,
  ROLES,
  type ClaveAjuste,
} from '@mesa/shared';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { db } from '../conexion';
import { DEPARTAMENTOS, EMPRESAS, MODULOS, TIPOS } from './datos-iniciales';
import { PLANTILLAS } from './plantillas-iniciales';

export const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

async function roles() {
  const nombres: Record<keyof typeof ROLES, { nombre: string; descripcion: string }> = {
    USUARIO: { nombre: 'Usuario', descripcion: 'Solicitante: crea tickets y da seguimiento a los suyos' },
    ADMIN_SOPORTE: { nombre: 'Admin soporte', descripcion: 'Atiende tickets y administra el sistema' },
  };

  await db
    .insertInto('permisos')
    .onConflict((oc) => oc.doNothing())
    .values(
      Object.entries(DESCRIPCION_PERMISOS).map(([codigo, d]) => ({ codigo, grupo: d.grupo, descripcion: d.descripcion })),
    )
    .execute();
  const permisos = await db.selectFrom('permisos').select(['id', 'codigo']).execute();
  const idPermiso = new Map(permisos.map((p) => [p.codigo, p.id]));

  for (const codigo of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
    const existe = await db.selectFrom('roles').select('id').where('codigo', '=', codigo).executeTakeFirst();
    if (existe) continue;
    const r = await db
      .insertInto('roles')
      .values({ codigo, ...nombres[codigo], es_sistema: 1 })
      .returning('id').executeTakeFirstOrThrow();
    const rolId = r.id;
    // Los permisos iniciales solo se asignan al crear el rol; después se administran en BD.
    await db
      .insertInto('rol_permisos')
      .values(PERMISOS_INICIALES[codigo].map((p) => ({ rol_id: rolId, permiso_id: idPermiso.get(p)! })))
      .execute();
    logger.info(`Rol creado: ${codigo}`);
  }
}

async function catalogos() {
  await db
    .insertInto('estatus_ticket')
    .onConflict((oc) => oc.doNothing())
    .values(
      LISTA_ESTATUS.map((codigo, i) => ({
        codigo,
        nombre: INFO_ESTATUS[codigo].nombre,
        clase_color: INFO_ESTATUS[codigo].clase,
        es_final: INFO_ESTATUS[codigo].esFinal ? 1 : 0,
        orden: i + 1,
      })),
    )
    .execute();

  await db
    .insertInto('departamentos')
    .onConflict((oc) => oc.doNothing())
    .values(DEPARTAMENTOS.map((d, i) => ({ nombre: d.nombre, codigo: d.codigo, activo: 1, orden: i + 1 })))
    .execute();

  await db
    .insertInto('empresas')
    .onConflict((oc) => oc.doNothing())
    .values(EMPRESAS.map((e, i) => ({ nombre: e.nombre, codigo: e.codigo, activa: 1, orden: i + 1 })))
    .execute();

  await db
    .insertInto('tipos_solicitud')
    .onConflict((oc) => oc.doNothing())
    .values(
      TIPOS.map((t, i) => ({
        nombre: t.nombre,
        codigo: t.codigo,
        titulo_detalle: t.tituloDetalle,
        requiere_modulo: t.requiereModulo ? 1 : 0,
        requiere_concepto: t.requiereConcepto ? 1 : 0,
        requiere_folios: t.requiereFolios ? 1 : 0,
        activo: 1,
        orden: i + 1,
      })),
    )
    .execute();

  await db
    .insertInto('modulos')
    .onConflict((oc) => oc.doNothing())
    .values(MODULOS.map((m, i) => ({ nombre: m.nombre, codigo: m.codigo, activo: 1, orden: i + 1 })))
    .execute();
}

async function plantillas() {
  await db
    .insertInto('plantillas_correo')
    .onConflict((oc) => oc.doNothing())
    .values(
      PLANTILLAS.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        asunto: p.asunto,
        cuerpo_html: p.cuerpoHtml,
        variables: JSON.stringify(p.variables),
        activa: 1,
      })),
    )
    .execute();
}

export function valoresInicialesAjustes(): Record<ClaveAjuste, unknown> {
  return {
    'sesion.inactividad_min': env.SESION_INACTIVIDAD_MIN,
    'sesion.max_horas': env.SESION_MAX_HORAS,
    'login.max_intentos': env.LOGIN_MAX_INTENTOS,
    'login.bloqueo_min': env.LOGIN_BLOQUEO_MIN,
    'password.min_caracteres': 8,
    'adjuntos.max_mb': Math.min(env.ADJUNTOS_MAX_MB, env.ADJUNTOS_TECHO_MB),
    'adjuntos.max_por_mensaje': env.ADJUNTOS_MAX_POR_MENSAJE,
    'adjuntos.tipos': env.ADJUNTOS_TIPOS.length
      ? env.ADJUNTOS_TIPOS
      : ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'xml', 'zip'],
    'correo.respuestas_activas': false,
    'correo.aviso_soporte_activo': false,
    // Encendido: solo se envía si además hay correos en "correo.aviso_soporte_destino".
    'correo.aviso_cierre_activo': true,
    'correo.aviso_soporte_destino': '',
    'kanban.tarjetas_por_columna': 50,
  };
}

async function ajustes() {
  const valores = valoresInicialesAjustes();
  await db
    .insertInto('ajustes')
    .onConflict((oc) => oc.doNothing())
    .values(
      (Object.keys(DEFINICION_AJUSTES) as ClaveAjuste[]).map((clave) => ({
        clave,
        valor: JSON.stringify(valores[clave]),
        descripcion: DEFINICION_AJUSTES[clave].descripcion,
      })),
    )
    .execute();
}

/** Crea el admin inicial solo si no existe ningún admin activo. */
export async function adminInicial(datos?: { usuario: string; email: string; password: string }) {
  const usuario = datos?.usuario ?? env.ADMIN_INICIAL_USUARIO;
  const email = datos?.email ?? env.ADMIN_INICIAL_EMAIL;
  const password = datos?.password ?? env.ADMIN_INICIAL_PASSWORD;
  const rol = await db.selectFrom('roles').select('id').where('codigo', '=', ROLES.ADMIN_SOPORTE).executeTakeFirstOrThrow();

  if (!datos) {
    const hayAdmin = await db
      .selectFrom('usuarios')
      .select('id')
      .where('rol_id', '=', rol.id)
      .where('eliminado_at', 'is', null)
      .executeTakeFirst();
    if (hayAdmin) return;
  }
  if (!usuario || !email || !password) {
    logger.warn('No hay administrador. Define ADMIN_INICIAL_* en .env o ejecuta: npm run crear-admin');
    return;
  }
  await db
    .insertInto('usuarios')
    .values({
      username: usuario,
      nombre: null,
      email,
      password_hash: await argon2.hash(password, OPCIONES_ARGON2),
      rol_id: rol.id,
      activo: 1,
      password_cambiado_at: new Date(),
      // El admin inicial de .env debe cambiar su contraseña al entrar por primera vez.
      debe_cambiar_password: datos ? 0 : 1,
      id_anterior: null,
    })
    .execute();
  logger.info(`Administrador creado: ${usuario}`);
}

export async function sembrar(): Promise<void> {
  await roles();
  await catalogos();
  await plantillas();
  await ajustes();
  await adminInicial();
  logger.info('Datos iniciales listos.');
}
