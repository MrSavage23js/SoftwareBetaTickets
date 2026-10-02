import argon2 from 'argon2';
import { sql } from 'kysely';
import {
  PERMISOS,
  ROLES,
  esquemaPassword,
  type UsuarioCrearEntrada,
  type UsuarioEditarEntrada,
  type UsuarioFila,
  esquemaUsuarioCrear,
  esquemaUsuarioEditar,
} from '@mesa/shared';
import { db, type Ejecutor } from '../../db/conexion';
import { OPCIONES_ARGON2 } from '../../db/seeds';
import { coincide, escaparLike } from '../../lib/buscar';
import { errores, esDuplicado } from '../../lib/errores';
import { validar } from '../../lib/validar';
import { obtenerAjustes } from '../ajustes/servicio';
import { cerrarSesionesDeUsuario, usuariosEnLinea } from '../auth/sesiones';
import { auditar } from '../eventos/servicio';

async function validarPasswordConAjustes(password: string | undefined) {
  if (!password) return;
  const min = (await obtenerAjustes())['password.min_caracteres'];
  const r = esquemaPassword(min).safeParse(password);
  if (!r.success) throw errores.validacion(r.error.issues[0]!.message, { password: r.error.issues[0]!.message });
}

async function validarRelaciones(ex: Ejecutor, rolId: number, empresaIds: number[], departamentoId: number | null = null) {
  const rol = await ex.selectFrom('roles').select('id').where('id', '=', rolId).executeTakeFirst();
  if (!rol) throw errores.validacion('El rol seleccionado no existe.', { rolId: 'El rol seleccionado no existe.' });
  if (departamentoId !== null) {
    const dep = await ex.selectFrom('departamentos').select('id').where('id', '=', departamentoId).executeTakeFirst();
    if (!dep) throw errores.validacion('El departamento no existe.', { departamentoId: 'El departamento no existe.' });
  }
  const unicas = [...new Set(empresaIds)];
  if (unicas.length) {
    const n = await ex
      .selectFrom('empresas')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('id', 'in', unicas)
      .executeTakeFirstOrThrow();
    if (Number(n.n) !== unicas.length) {
      throw errores.validacion('Alguna empresa seleccionada no existe.', { empresaIds: 'Alguna empresa seleccionada no existe.' });
    }
  }
  return unicas;
}

async function rolAdminId(ex: Ejecutor): Promise<number> {
  const r = await ex.selectFrom('roles').select('id').where('codigo', '=', ROLES.ADMIN_SOPORTE).executeTakeFirstOrThrow();
  return r.id;
}

/** Evita dejar el sistema sin ningún administrador activo. */
async function asegurarOtroAdmin(ex: Ejecutor, excluirId: number) {
  const n = await ex
    .selectFrom('usuarios')
    .select(sql<number>`COUNT(*)`.as('n'))
    .where('rol_id', '=', await rolAdminId(ex))
    .where('activo', '=', 1)
    .where('eliminado_at', 'is', null)
    .where('id', '!=', excluirId)
    .executeTakeFirstOrThrow();
  if (Number(n.n) === 0) throw errores.conflicto('Debe quedar al menos un administrador activo en el sistema.', 'ULTIMO_ADMIN');
}

export async function listarUsuarios(q?: string): Promise<UsuarioFila[]> {
  let consulta = db
    .selectFrom('usuarios as u')
    .innerJoin('roles as r', 'r.id', 'u.rol_id')
    .leftJoin('departamentos as dp', 'dp.id', 'u.departamento_id')
    .select([
      'dp.id as dp_id',
      'dp.nombre as dp_nombre',
      'u.id',
      'u.username',
      'u.nombre',
      'u.email',
      'u.activo',
      'u.ultimo_login_at',
      'u.creado_at',
      'r.id as rol_id',
      'r.codigo as rol_codigo',
      'r.nombre as rol_nombre',
    ])
    .where('u.eliminado_at', 'is', null)
    .orderBy('u.username');
  if (q) {
    const patron = `%${escaparLike(q)}%`;
    consulta = consulta.where((eb) =>
      eb.or([coincide('u.username', patron), coincide('u.nombre', patron), coincide('u.email', patron)]),
    );
  }
  const filas = await consulta.execute();
  const ids = filas.map((f) => f.id);
  const [empresas, enLinea] = await Promise.all([
    ids.length
      ? db
          .selectFrom('usuario_empresas as ue')
          .innerJoin('empresas as e', 'e.id', 'ue.empresa_id')
          .select(['ue.usuario_id', 'e.id', 'e.nombre'])
          .where('ue.usuario_id', 'in', ids)
          .orderBy('e.nombre')
          .execute()
      : [],
    usuariosEnLinea(ids),
  ]);
  return filas.map((f) => ({
    id: f.id,
    username: f.username,
    nombre: f.nombre,
    email: f.email,
    rol: { id: f.rol_id, codigo: f.rol_codigo, nombre: f.rol_nombre },
    departamento: f.dp_id === null ? null : { id: f.dp_id, nombre: f.dp_nombre! },
    empresas: empresas.filter((e) => e.usuario_id === f.id).map((e) => ({ id: e.id, nombre: e.nombre })),
    activo: !!f.activo,
    ultimoLoginAt: f.ultimo_login_at?.toISOString() ?? null,
    enLinea: enLinea.has(f.id),
    creadoAt: f.creado_at.toISOString(),
  }));
}

export async function obtenerUsuario(id: number): Promise<UsuarioFila> {
  const u = (await listarUsuarios()).find((x) => x.id === id);
  if (!u) throw errores.noEncontrado('El usuario no existe o fue dado de baja.');
  return u;
}

export async function crearUsuario(entrada: UsuarioCrearEntrada, actorId: number, ip: string): Promise<number> {
  const d = validar(esquemaUsuarioCrear, entrada);
  await validarPasswordConAjustes(d.password);
  const hash = await argon2.hash(d.password, OPCIONES_ARGON2);
  try {
    return await db.transaction().execute(async (tx) => {
      const empresas = await validarRelaciones(tx, d.rolId, d.empresaIds, d.departamentoId);
      const r = await tx
        .insertInto('usuarios')
        .values({
          username: d.username,
          nombre: d.nombre,
          email: d.email,
          password_hash: hash,
          rol_id: d.rolId,
          departamento_id: d.departamentoId,
          activo: d.activo ? 1 : 0,
          password_cambiado_at: new Date(),
          // La contraseña la eligió el admin: el usuario la cambia en su primer inicio de sesión.
          debe_cambiar_password: 1,
          id_anterior: null,
        })
        .returning('id').executeTakeFirstOrThrow();
      const id = r.id;
      if (empresas.length) {
        await tx.insertInto('usuario_empresas').values(empresas.map((e) => ({ usuario_id: id, empresa_id: e }))).execute();
      }
      await auditar(tx, {
        actorId,
        entidad: 'usuario',
        entidadId: id,
        accion: 'CREADO',
        ip,
        datos: { username: d.username, email: d.email, rolId: d.rolId, empresaIds: empresas, activo: d.activo },
      });
      return id;
    });
  } catch (e) {
    if (esDuplicado(e)) {
      throw errores.conflicto('Ese nombre de usuario ya existe (o existió y fue dado de baja). Elige otro.', 'USUARIO_DUPLICADO');
    }
    throw e;
  }
}

export async function editarUsuario(id: number, entrada: UsuarioEditarEntrada, actorId: number, ip: string) {
  const d = validar(esquemaUsuarioEditar, entrada);
  await validarPasswordConAjustes(d.password || undefined);
  const hash = d.password ? await argon2.hash(d.password, OPCIONES_ARGON2) : undefined;

  try {
    await db.transaction().execute(async (tx) => {
      const actual = await tx
        .selectFrom('usuarios')
        .selectAll()
        .where('id', '=', id)
        .where('eliminado_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!actual) throw errores.noEncontrado('El usuario no existe o fue dado de baja.');

      const empresas = await validarRelaciones(tx, d.rolId, d.empresaIds, d.departamentoId);
      const adminId = await rolAdminId(tx);
      const dejaDeSerAdmin = actual.rol_id === adminId && (d.rolId !== adminId || !d.activo);
      if (dejaDeSerAdmin) await asegurarOtroAdmin(tx, id);
      if (id === actorId && !d.activo) throw errores.conflicto('No puedes desactivar tu propio usuario.');

      await tx
        .updateTable('usuarios')
        .set({
          username: d.username,
          nombre: d.nombre,
          email: d.email,
          rol_id: d.rolId,
          departamento_id: d.departamentoId,
          activo: d.activo ? 1 : 0,
          ...(hash
            ? {
                password_hash: hash,
                password_cambiado_at: new Date(),
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                debe_cambiar_password: id === actorId ? 0 : 1,
              }
            : {}),
        })
        .where('id', '=', id)
        .execute();

      await tx.deleteFrom('usuario_empresas').where('usuario_id', '=', id).execute();
      if (empresas.length) {
        await tx.insertInto('usuario_empresas').values(empresas.map((e) => ({ usuario_id: id, empresa_id: e }))).execute();
      }

      // Cambio de contraseña, rol o desactivación: se cierran sus sesiones para que entren con los datos nuevos.
      if (hash || !d.activo || actual.rol_id !== d.rolId) {
        await cerrarSesionesDeUsuario(tx, id, !d.activo ? 'BAJA' : 'PASSWORD', actorId);
      }

      await auditar(tx, {
        actorId,
        entidad: 'usuario',
        entidadId: id,
        accion: 'EDITADO',
        ip,
        datos: {
          antes: { username: actual.username, email: actual.email, rolId: actual.rol_id, activo: !!actual.activo },
          despues: { username: d.username, email: d.email, rolId: d.rolId, activo: d.activo, empresaIds: empresas },
          cambioPassword: !!hash,
        },
      });
    });
  } catch (e) {
    if (esDuplicado(e)) throw errores.conflicto('Ese nombre de usuario ya existe. Elige otro.', 'USUARIO_DUPLICADO');
    throw e;
  }
}

/** Baja lógica: conserva sus tickets, cierra sus sesiones y su nombre de usuario no se reutiliza. */
export async function eliminarUsuario(id: number, actorId: number, ip: string) {
  if (id === actorId) throw errores.conflicto('No puedes eliminar tu propio usuario.');
  await db.transaction().execute(async (tx) => {
    const u = await tx
      .selectFrom('usuarios')
      .select(['id', 'username', 'rol_id'])
      .where('id', '=', id)
      .where('eliminado_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!u) throw errores.noEncontrado('El usuario no existe o ya fue dado de baja.');
    if (u.rol_id === (await rolAdminId(tx))) await asegurarOtroAdmin(tx, id);

    await tx.updateTable('usuarios').set({ eliminado_at: new Date(), activo: 0 }).where('id', '=', id).execute();
    await cerrarSesionesDeUsuario(tx, id, 'BAJA', actorId);
    await auditar(tx, { actorId, entidad: 'usuario', entidadId: id, accion: 'ELIMINADO', ip, datos: { username: u.username } });
  });
}

export async function cerrarSesionRemota(id: number, actorId: number, ip: string): Promise<number> {
  const u = await db.selectFrom('usuarios').select('id').where('id', '=', id).where('eliminado_at', 'is', null).executeTakeFirst();
  if (!u) throw errores.noEncontrado('El usuario no existe.');
  const n = await cerrarSesionesDeUsuario(db, id, 'ADMIN', actorId);
  await auditar(db, { actorId, entidad: 'usuario', entidadId: id, accion: 'SESION_CERRADA', ip, datos: { sesiones: n } });
  return n;
}

export async function listarRoles() {
  return db.selectFrom('roles').select(['id', 'codigo', 'nombre', 'descripcion']).orderBy('id').execute();
}

/** Usuarios que pueden atender tickets (para reasignar y filtrar por técnico). */
export async function listarTecnicos() {
  return db
    .selectFrom('usuarios as u')
    .innerJoin('rol_permisos as rp', 'rp.rol_id', 'u.rol_id')
    .innerJoin('permisos as p', 'p.id', 'rp.permiso_id')
    .select(['u.id', 'u.username', 'u.nombre'])
    .where('p.codigo', '=', PERMISOS.TICKETS_ATENDER)
    .where('u.activo', '=', 1)
    .where('u.eliminado_at', 'is', null)
    .orderBy('u.username')
    .execute();
}

/** Contactos para "Enviar copia a": usuarios activos, búsqueda por nombre, usuario o correo. */
export async function buscarContactos(q: string, excluirId: number) {
  const patron = `%${escaparLike(q)}%`;
  return db
    .selectFrom('usuarios')
    .select(['id', 'username', 'nombre', 'email'])
    .where('activo', '=', 1)
    .where('eliminado_at', 'is', null)
    .where('id', '!=', excluirId)
    .where((eb) => eb.or([coincide('username', patron), coincide('nombre', patron), coincide('email', patron)]))
    .orderBy('username')
    .limit(20)
    .execute();
}
