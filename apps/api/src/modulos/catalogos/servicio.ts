import { sql } from 'kysely';
import {
  INFO_ESTATUS,
  PERMISOS,
  esquemaDepartamento,
  esquemaEmpresa,
  esquemaModulo,
  esquemaTipoSolicitud,
  type Catalogos,
  type Estatus,
} from '@mesa/shared';
import { db } from '../../db/conexion';
import { errores, esDuplicado } from '../../lib/errores';
import { validar } from '../../lib/validar';
import type { UsuarioActual } from '../auth/contexto';
import { auditar } from '../eventos/servicio';

const b = (v: number) => !!v;

/** Catálogos para formularios y filtros. Un usuario sin `tickets.ver_todos` solo ve sus empresas. */
export async function catalogosPara(u: UsuarioActual, modoAdmin: boolean): Promise<Catalogos> {
  const admin = modoAdmin && u.permisos.has(PERMISOS.CATALOGOS_ADMINISTRAR);
  const verTodas = u.permisos.has(PERMISOS.TICKETS_VER_TODOS) || admin;

  let qEmpresas = db
    .selectFrom('empresas as e')
    .select(['e.id', 'e.nombre', 'e.codigo', 'e.activa', 'e.orden'])
    .orderBy('e.orden')
    .orderBy('e.nombre');
  if (!admin) qEmpresas = qEmpresas.where('e.activa', '=', 1);
  if (!verTodas) {
    qEmpresas = qEmpresas.where('e.id', 'in', db.selectFrom('usuario_empresas').select('empresa_id').where('usuario_id', '=', u.id));
  }

  let qTipos = db.selectFrom('tipos_solicitud').selectAll().orderBy('orden').orderBy('nombre');
  let qModulos = db.selectFrom('modulos').selectAll().orderBy('orden').orderBy('nombre');
  if (!admin) {
    qTipos = qTipos.where('activo', '=', 1);
    qModulos = qModulos.where('activo', '=', 1);
  }

  let qDepartamentos = db.selectFrom('departamentos').selectAll().orderBy('orden').orderBy('nombre');
  if (!admin) qDepartamentos = qDepartamentos.where('activo', '=', 1);

  const [departamentos, empresas, tipos, modulos, estatus, conteos] = await Promise.all([
    qDepartamentos.execute(),
    qEmpresas.execute(),
    qTipos.execute(),
    qModulos.execute(),
    db.selectFrom('estatus_ticket').selectAll().orderBy('orden').execute(),
    admin ? conteosDeUso() : Promise.resolve(undefined),
  ]);

  return {
    departamentos: departamentos.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      codigo: d.codigo,
      activo: b(d.activo),
      orden: d.orden,
      ...(conteos ? { tickets: conteos.departamentos.get(d.id) ?? 0, usuarios: conteos.usuariosDepto.get(d.id) ?? 0 } : {}),
    })),
    empresas: empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      codigo: e.codigo,
      activa: b(e.activa),
      orden: e.orden,
      ...(conteos ? { tickets: conteos.empresas.get(e.id) ?? 0, usuarios: conteos.usuarios.get(e.id) ?? 0 } : {}),
    })),
    tipos: tipos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      codigo: t.codigo,
      tituloDetalle: t.titulo_detalle,
      requiereModulo: b(t.requiere_modulo),
      requiereConcepto: b(t.requiere_concepto),
      requiereFolios: b(t.requiere_folios),
      activo: b(t.activo),
      orden: t.orden,
      ...(conteos ? { tickets: conteos.tipos.get(t.id) ?? 0 } : {}),
    })),
    modulos: modulos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      codigo: m.codigo,
      activo: b(m.activo),
      orden: m.orden,
      ...(conteos ? { tickets: conteos.modulos.get(m.id) ?? 0 } : {}),
    })),
    estatus: estatus.map((e) => ({
      codigo: e.codigo as Estatus,
      nombre: e.nombre,
      clase: e.clase_color || INFO_ESTATUS[e.codigo as Estatus]?.clase || 'pend',
      orden: e.orden,
    })),
  };
}

async function conteosDeUso() {
  const conteo = async (col: 'departamento_id' | 'empresa_id' | 'tipo_id' | 'modulo_id') => {
    const filas = await db
      .selectFrom('tickets')
      .select([col, sql<number>`COUNT(*)`.as('n')])
      .groupBy(col)
      .execute();
    return new Map(filas.map((f) => [Number(f[col as keyof typeof f]), Number(f.n)]));
  };
  const usuarios = await db
    .selectFrom('usuario_empresas as ue')
    .innerJoin('usuarios as u', 'u.id', 'ue.usuario_id')
    .select(['ue.empresa_id', sql<number>`COUNT(*)`.as('n')])
    .where('u.eliminado_at', 'is', null)
    .groupBy('ue.empresa_id')
    .execute();
  const usuariosDepto = await db
    .selectFrom('usuarios')
    .select(['departamento_id', sql<number>`COUNT(*)`.as('n')])
    .where('eliminado_at', 'is', null)
    .where('departamento_id', 'is not', null)
    .groupBy('departamento_id')
    .execute();
  return {
    departamentos: await conteo('departamento_id'),
    usuariosDepto: new Map(usuariosDepto.map((f) => [Number(f.departamento_id), Number(f.n)])),
    empresas: await conteo('empresa_id'),
    tipos: await conteo('tipo_id'),
    modulos: await conteo('modulo_id'),
    usuarios: new Map(usuarios.map((f) => [f.empresa_id, Number(f.n)])),
  };
}

const DUPLICADO = 'Ya existe un registro con ese nombre o código.';

// ---------------------------------------------------------------- Departamentos (su código forma el folio)
export async function guardarDepartamento(id: number | null, entrada: unknown, actorId: number, ip: string) {
  const d = validar(esquemaDepartamento, entrada);
  const valores = { nombre: d.nombre, codigo: d.codigo, activo: d.activo ? 1 : 0, orden: d.orden };
  try {
    if (id === null) {
      const r = await db.insertInto('departamentos').values(valores).executeTakeFirstOrThrow();
      const nuevo = Number(r.insertId);
      await auditar(db, { actorId, entidad: 'departamento', entidadId: nuevo, accion: 'CREADO', ip, datos: valores });
      return { id: nuevo, advertencia: null };
    }
    const antes = await db.selectFrom('departamentos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw errores.noEncontrado('El departamento no existe.');
    await db.updateTable('departamentos').set(valores).where('id', '=', id).execute();
    await auditar(db, { actorId, entidad: 'departamento', entidadId: id, accion: 'EDITADO', ip, datos: { antes, despues: valores } });
    const usado = !!(await db.selectFrom('tickets').select('id').where('departamento_id', '=', id).limit(1).executeTakeFirst());
    return {
      id,
      advertencia:
        antes.codigo !== d.codigo && usado
          ? 'El código cambió. Los folios ya emitidos no cambian; los tickets nuevos usarán el código nuevo y empezarán en 0001.'
          : null,
    };
  } catch (e) {
    if (esDuplicado(e)) throw errores.conflicto(DUPLICADO, 'DUPLICADO');
    throw e;
  }
}

// ---------------------------------------------------------------- Empresas
export async function guardarEmpresa(id: number | null, entrada: unknown, actorId: number, ip: string) {
  const d = validar(esquemaEmpresa, entrada);
  const valores = { nombre: d.nombre, codigo: d.codigo, activa: d.activa ? 1 : 0, orden: d.orden };
  try {
    if (id === null) {
      const r = await db.insertInto('empresas').values(valores).executeTakeFirstOrThrow();
      const nuevo = Number(r.insertId);
      await auditar(db, { actorId, entidad: 'empresa', entidadId: nuevo, accion: 'CREADA', ip, datos: valores });
      return { id: nuevo, advertencia: null };
    }
    const antes = await db.selectFrom('empresas').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw errores.noEncontrado('La empresa no existe.');
    await db.updateTable('empresas').set(valores).where('id', '=', id).execute();
    await auditar(db, { actorId, entidad: 'empresa', entidadId: id, accion: 'EDITADA', ip, datos: { antes, despues: valores } });
    return { id, advertencia: null };
  } catch (e) {
    if (esDuplicado(e)) throw errores.conflicto(DUPLICADO, 'DUPLICADO');
    throw e;
  }
}

// ---------------------------------------------------------------- Tipos de solicitud
export async function guardarTipo(id: number | null, entrada: unknown, actorId: number, ip: string) {
  const d = validar(esquemaTipoSolicitud, entrada);
  const valores = {
    nombre: d.nombre,
    codigo: d.codigo,
    titulo_detalle: d.tituloDetalle,
    requiere_modulo: d.requiereModulo ? 1 : 0,
    requiere_concepto: d.requiereConcepto ? 1 : 0,
    requiere_folios: d.requiereFolios ? 1 : 0,
    activo: d.activo ? 1 : 0,
    orden: d.orden,
  };
  try {
    if (id === null) {
      const r = await db.insertInto('tipos_solicitud').values(valores).executeTakeFirstOrThrow();
      const nuevo = Number(r.insertId);
      await auditar(db, { actorId, entidad: 'tipo_solicitud', entidadId: nuevo, accion: 'CREADO', ip, datos: valores });
      return { id: nuevo, advertencia: null };
    }
    const antes = await db.selectFrom('tipos_solicitud').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw errores.noEncontrado('El tipo de solicitud no existe.');
    await db.updateTable('tipos_solicitud').set(valores).where('id', '=', id).execute();
    await auditar(db, { actorId, entidad: 'tipo_solicitud', entidadId: id, accion: 'EDITADO', ip, datos: { antes, despues: valores } });
    return { id, advertencia: null };
  } catch (e) {
    if (esDuplicado(e)) throw errores.conflicto(DUPLICADO, 'DUPLICADO');
    throw e;
  }
}

// ---------------------------------------------------------------- Módulos
export async function guardarModulo(id: number | null, entrada: unknown, actorId: number, ip: string) {
  const d = validar(esquemaModulo, entrada);
  const valores = { nombre: d.nombre, codigo: d.codigo, activo: d.activo ? 1 : 0, orden: d.orden };
  try {
    if (id === null) {
      const r = await db.insertInto('modulos').values(valores).executeTakeFirstOrThrow();
      const nuevo = Number(r.insertId);
      await auditar(db, { actorId, entidad: 'modulo', entidadId: nuevo, accion: 'CREADO', ip, datos: valores });
      return { id: nuevo, advertencia: null };
    }
    const antes = await db.selectFrom('modulos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw errores.noEncontrado('El módulo no existe.');
    await db.updateTable('modulos').set(valores).where('id', '=', id).execute();
    await auditar(db, { actorId, entidad: 'modulo', entidadId: id, accion: 'EDITADO', ip, datos: { antes, despues: valores } });
    return { id, advertencia: null };
  } catch (e) {
    if (esDuplicado(e)) throw errores.conflicto(DUPLICADO, 'DUPLICADO');
    throw e;
  }
}
