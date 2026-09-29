// Sesiones guardadas en BD (DECISIONES D5–D7).
// - La cookie lleva un token aleatorio; en BD solo se guarda su SHA-256.
// - Inactividad: cuenta la última actividad real del usuario, no las consultas automáticas de la pantalla.
// - "En línea" = sesión abierta, no expirada y con actividad dentro del tiempo de inactividad.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import { db, type Ejecutor } from '../../db/conexion';
import type { MotivoCierreSesion } from '../../db/tipos';
import { minutos } from '../../lib/fechas';
import { obtenerAjustes } from '../ajustes/servicio';
import type { SesionActual, UsuarioActual } from './contexto';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function igualesSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function crearSesion(usuarioId: number, ip: string, userAgent: string) {
  const ajustes = await obtenerAjustes();
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('hex');
  const ahora = new Date();
  await db
    .insertInto('sesiones')
    .values({
      id: hashToken(token),
      usuario_id: usuarioId,
      csrf_token: csrfToken,
      creada_at: ahora,
      ultima_actividad_at: ahora,
      expira_absoluta_at: new Date(ahora.getTime() + ajustes['sesion.max_horas'] * 3_600_000),
      ip,
      user_agent: userAgent.slice(0, 255),
      cerrada_at: null,
      motivo_cierre: null,
      cerrada_por_id: null,
    })
    .execute();
  return { token, csrfToken };
}

// Permisos por rol con caché corta (cambian muy rara vez).
const cachePermisos = new Map<number, { permisos: Set<string>; hasta: number }>();
export async function permisosDeRol(rolId: number): Promise<Set<string>> {
  const c = cachePermisos.get(rolId);
  if (c && c.hasta > Date.now()) return c.permisos;
  const filas = await db
    .selectFrom('rol_permisos as rp')
    .innerJoin('permisos as p', 'p.id', 'rp.permiso_id')
    .select('p.codigo')
    .where('rp.rol_id', '=', rolId)
    .execute();
  const permisos = new Set(filas.map((f) => f.codigo));
  cachePermisos.set(rolId, { permisos, hasta: Date.now() + 30_000 });
  return permisos;
}
export const invalidarPermisos = () => cachePermisos.clear();

export type ResultadoSesion =
  | { ok: true; usuario: UsuarioActual; sesion: SesionActual; ultimaActividad: Date }
  | { ok: false; motivo: 'NO_EXISTE' | 'CERRADA' | 'INACTIVIDAD' | 'EXPIRADA' };

/** Busca y valida la sesión de un token. Si expiró, la marca cerrada. */
export async function resolverSesion(token: string): Promise<ResultadoSesion> {
  const id = hashToken(token);
  const fila = await db
    .selectFrom('sesiones as s')
    .innerJoin('usuarios as u', 'u.id', 's.usuario_id')
    .innerJoin('roles as r', 'r.id', 'u.rol_id')
    .select([
      's.id',
      's.csrf_token',
      's.ultima_actividad_at',
      's.expira_absoluta_at',
      's.cerrada_at',
      'u.id as usuario_id',
      'u.username',
      'u.nombre',
      'u.email',
      'u.activo',
      'u.eliminado_at',
      'u.debe_cambiar_password',
      'u.rol_id',
      'r.codigo as rol_codigo',
      'r.nombre as rol_nombre',
    ])
    .where('s.id', '=', id)
    .executeTakeFirst();

  if (!fila) return { ok: false, motivo: 'NO_EXISTE' };
  if (fila.cerrada_at || !fila.activo || fila.eliminado_at) return { ok: false, motivo: 'CERRADA' };

  const ahora = Date.now();
  const { 'sesion.inactividad_min': inactividad } = await obtenerAjustes();
  if (fila.expira_absoluta_at.getTime() <= ahora) {
    await cerrarSesion(id, 'EXPIRADA');
    return { ok: false, motivo: 'EXPIRADA' };
  }
  if (fila.ultima_actividad_at.getTime() + minutos(inactividad) <= ahora) {
    await cerrarSesion(id, 'INACTIVIDAD');
    return { ok: false, motivo: 'INACTIVIDAD' };
  }

  return {
    ok: true,
    ultimaActividad: fila.ultima_actividad_at,
    sesion: { id: fila.id, csrfToken: fila.csrf_token },
    usuario: {
      id: fila.usuario_id,
      username: fila.username,
      nombre: fila.nombre,
      email: fila.email,
      rolId: fila.rol_id,
      rolCodigo: fila.rol_codigo,
      rolNombre: fila.rol_nombre,
      permisos: await permisosDeRol(fila.rol_id),
      debeCambiarPassword: !!fila.debe_cambiar_password,
    },
  };
}

/** Registra actividad del usuario (como máximo una escritura por minuto por sesión). */
export async function tocarSesion(sesionId: string, ultimaActividad: Date): Promise<void> {
  if (Date.now() - ultimaActividad.getTime() < 60_000) return;
  await registrarActividad(sesionId);
}

/** Actividad explícita (la web avisa que el usuario movió el ratón o escribió): sin límite de frecuencia. */
export async function registrarActividad(sesionId: string): Promise<void> {
  await db
    .updateTable('sesiones')
    .set({ ultima_actividad_at: new Date() })
    .where('id', '=', sesionId)
    .where('cerrada_at', 'is', null)
    .execute();
}

export async function cerrarSesion(sesionId: string, motivo: MotivoCierreSesion, porId: number | null = null) {
  await db
    .updateTable('sesiones')
    .set({ cerrada_at: new Date(), motivo_cierre: motivo, cerrada_por_id: porId })
    .where('id', '=', sesionId)
    .where('cerrada_at', 'is', null)
    .execute();
}

/** Cierra todas las sesiones abiertas de un usuario (baja, cambio de contraseña, cierre remoto). */
export async function cerrarSesionesDeUsuario(
  ex: Ejecutor,
  usuarioId: number,
  motivo: MotivoCierreSesion,
  porId: number | null,
  exceptoSesionId?: string,
): Promise<number> {
  let q = ex
    .updateTable('sesiones')
    .set({ cerrada_at: new Date(), motivo_cierre: motivo, cerrada_por_id: porId })
    .where('usuario_id', '=', usuarioId)
    .where('cerrada_at', 'is', null);
  if (exceptoSesionId) q = q.where('id', '!=', exceptoSesionId);
  const r = await q.executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/** Ids de usuarios con sesión viva (para el estatus En línea / Desconectado). */
export async function usuariosEnLinea(ids?: number[]): Promise<Set<number>> {
  if (ids && ids.length === 0) return new Set();
  const { 'sesion.inactividad_min': inactividad } = await obtenerAjustes();
  let q = db
    .selectFrom('sesiones')
    .select('usuario_id')
    .distinct()
    .where('cerrada_at', 'is', null)
    .where('expira_absoluta_at', '>', sql<Date>`NOW(3)`)
    .where('ultima_actividad_at', '>', sql<Date>`NOW(3) - INTERVAL ${inactividad} MINUTE`);
  if (ids) q = q.where('usuario_id', 'in', ids);
  const filas = await q.execute();
  return new Set(filas.map((f) => f.usuario_id));
}

/** Tarea periódica: marca cerradas las sesiones que ya expiraron (para que las cifras sean exactas). */
export async function limpiarSesionesVencidas(): Promise<number> {
  const { 'sesion.inactividad_min': inactividad } = await obtenerAjustes();
  const r1 = await db
    .updateTable('sesiones')
    .set({ cerrada_at: sql<Date>`NOW(3)`, motivo_cierre: 'INACTIVIDAD' })
    .where('cerrada_at', 'is', null)
    .where('ultima_actividad_at', '<=', sql<Date>`NOW(3) - INTERVAL ${inactividad} MINUTE`)
    .executeTakeFirst();
  const r2 = await db
    .updateTable('sesiones')
    .set({ cerrada_at: sql<Date>`NOW(3)`, motivo_cierre: 'EXPIRADA' })
    .where('cerrada_at', 'is', null)
    .where('expira_absoluta_at', '<=', sql<Date>`NOW(3)`)
    .executeTakeFirst();
  // Las sesiones cerradas hace más de 90 días ya no aportan nada.
  await db.deleteFrom('sesiones').where('cerrada_at', '<', sql<Date>`NOW(3) - INTERVAL 90 DAY`).execute();
  return Number(r1.numUpdatedRows) + Number(r2.numUpdatedRows);
}
