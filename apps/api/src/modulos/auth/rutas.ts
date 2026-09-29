import { Router, type Request } from 'express';
import argon2 from 'argon2';
import { esquemaLogin, type RespuestaSesion, type UsuarioSesion } from '@mesa/shared';
import { env } from '../../config/env';
import { db } from '../../db/conexion';
import { OPCIONES_ARGON2 } from '../../db/seeds';
import { ErrorApp, errores } from '../../lib/errores';
import { sumarMinutos } from '../../lib/fechas';
import { validar } from '../../lib/validar';
import { limiteLogin } from '../../middleware/limites';
import { opcionesCookie, requiereSesion } from '../../middleware/sesion';
import { obtenerAjustes } from '../ajustes/servicio';
import { auditar } from '../eventos/servicio';
import { actor, ipDe, nombreVisible, type UsuarioActual } from './contexto';
import { cerrarSesion, crearSesion, permisosDeRol, registrarActividad } from './sesiones';

export const rutasAuth = Router();

// Hash fijo para comparar cuando el usuario no existe: así la respuesta tarda lo mismo
// y no se puede averiguar qué nombres de usuario existen midiendo el tiempo.
let hashFalso: Promise<string> | undefined;
const obtenerHashFalso = () => (hashFalso ??= argon2.hash('contraseña-inexistente', OPCIONES_ARGON2));

const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos.';

async function registrarIntento(username: string, usuarioId: number | null, ip: string, exito: boolean, motivo: string | null) {
  await db
    .insertInto('intentos_login')
    .values({ username: username.slice(0, 60), usuario_id: usuarioId, ip, exito: exito ? 1 : 0, motivo })
    .execute();
}

async function datosSesion(u: UsuarioActual): Promise<UsuarioSesion> {
  const ajustes = await obtenerAjustes();
  const empresas = await db
    .selectFrom('usuario_empresas as ue')
    .innerJoin('empresas as e', 'e.id', 'ue.empresa_id')
    .select(['e.id', 'e.nombre'])
    .where('ue.usuario_id', '=', u.id)
    .where('e.activa', '=', 1)
    .orderBy('e.orden')
    .orderBy('e.nombre')
    .execute();
  return {
    id: u.id,
    username: u.username,
    nombre: nombreVisible(u),
    email: u.email,
    rol: { codigo: u.rolCodigo, nombre: u.rolNombre },
    permisos: [...u.permisos].sort(),
    empresas,
    inactividadMin: ajustes['sesion.inactividad_min'],
    adjuntos: {
      maxMb: ajustes['adjuntos.max_mb'],
      maxPorMensaje: ajustes['adjuntos.max_por_mensaje'],
      tipos: ajustes['adjuntos.tipos'],
    },
  };
}

rutasAuth.post('/login', limiteLogin, async (req: Request, res) => {
  const { username, password } = validar(esquemaLogin, req.body);
  const ip = ipDe(req);
  const ajustes = await obtenerAjustes();

  const u = await db
    .selectFrom('usuarios as u')
    .innerJoin('roles as r', 'r.id', 'u.rol_id')
    .select([
      'u.id',
      'u.username',
      'u.nombre',
      'u.email',
      'u.password_hash',
      'u.activo',
      'u.intentos_fallidos',
      'u.bloqueado_hasta',
      'u.rol_id',
      'r.codigo as rol_codigo',
      'r.nombre as rol_nombre',
    ])
    .where('u.username', '=', username)
    .where('u.eliminado_at', 'is', null)
    .executeTakeFirst();

  if (!u) {
    await argon2.verify(await obtenerHashFalso(), password).catch(() => false);
    await registrarIntento(username, null, ip, false, 'NO_EXISTE');
    throw errores.noAutenticado(CREDENCIALES_INVALIDAS);
  }

  if (u.bloqueado_hasta && u.bloqueado_hasta.getTime() > Date.now()) {
    const min = Math.ceil((u.bloqueado_hasta.getTime() - Date.now()) / 60_000);
    await registrarIntento(username, u.id, ip, false, 'BLOQUEADO');
    throw new ErrorApp(
      423,
      'CUENTA_BLOQUEADA',
      `Tu cuenta está bloqueada temporalmente por varios intentos fallidos. Inténtalo en ${min} minuto${min === 1 ? '' : 's'}.`,
    );
  }

  const correcta = await argon2.verify(u.password_hash, password).catch(() => false);
  if (!correcta) {
    const intentos = u.intentos_fallidos + 1;
    const bloquear = intentos >= ajustes['login.max_intentos'];
    await db
      .updateTable('usuarios')
      .set({
        intentos_fallidos: bloquear ? 0 : intentos,
        bloqueado_hasta: bloquear ? sumarMinutos(new Date(), ajustes['login.bloqueo_min']) : null,
      })
      .where('id', '=', u.id)
      .execute();
    await registrarIntento(username, u.id, ip, false, bloquear ? 'BLOQUEO' : 'PASSWORD');
    if (bloquear) {
      await auditar(db, { actorId: null, entidad: 'usuario', entidadId: u.id, accion: 'BLOQUEO_POR_INTENTOS', ip });
      throw new ErrorApp(
        423,
        'CUENTA_BLOQUEADA',
        `Demasiados intentos fallidos. Tu cuenta quedó bloqueada ${ajustes['login.bloqueo_min']} minutos.`,
      );
    }
    const restantes = ajustes['login.max_intentos'] - intentos;
    throw errores.noAutenticado(
      restantes <= 2
        ? `${CREDENCIALES_INVALIDAS} Te quedan ${restantes} intento${restantes === 1 ? '' : 's'} antes del bloqueo temporal.`
        : CREDENCIALES_INVALIDAS,
    );
  }

  if (!u.activo) {
    await registrarIntento(username, u.id, ip, false, 'INACTIVO');
    throw errores.prohibido('Tu usuario está desactivado. Solicita acceso al administrador.');
  }

  // Actualiza el hash si cambiaron los parámetros de argon2.
  const nuevoHash = argon2.needsRehash(u.password_hash, OPCIONES_ARGON2)
    ? await argon2.hash(password, OPCIONES_ARGON2)
    : undefined;
  await db
    .updateTable('usuarios')
    .set({
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      ultimo_login_at: new Date(),
      ...(nuevoHash ? { password_hash: nuevoHash } : {}),
    })
    .where('id', '=', u.id)
    .execute();
  await registrarIntento(username, u.id, ip, true, null);

  const { token, csrfToken } = await crearSesion(u.id, ip, req.get('user-agent') ?? '');
  res.cookie(env.SESSION_COOKIE_NAME, token, opcionesCookie());

  const actual: UsuarioActual = {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    email: u.email,
    rolId: u.rol_id,
    rolCodigo: u.rol_codigo,
    rolNombre: u.rol_nombre,
    permisos: await permisosDeRol(u.rol_id),
  };
  const cuerpo: RespuestaSesion = { usuario: await datosSesion(actual), csrfToken };
  res.json(cuerpo);
});

rutasAuth.post('/logout', async (req, res) => {
  if (req.sesion) await cerrarSesion(req.sesion.id, 'LOGOUT');
  res.clearCookie(env.SESSION_COOKIE_NAME, opcionesCookie());
  res.status(204).end();
});

rutasAuth.get('/yo', requiereSesion, async (req, res) => {
  const cuerpo: RespuestaSesion = { usuario: await datosSesion(actor(req)), csrfToken: req.sesion!.csrfToken };
  res.json(cuerpo);
});

/** La web lo llama (máx. 1 vez por minuto) cuando el usuario movió el ratón o escribió: mantiene viva la sesión. */
rutasAuth.post('/actividad', requiereSesion, async (req, res) => {
  await registrarActividad(req.sesion!.id);
  res.status(204).end();
});
