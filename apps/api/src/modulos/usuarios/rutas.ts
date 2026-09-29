import { Router } from 'express';
import { z } from 'zod';
import { PERMISOS } from '@mesa/shared';
import { idDeRuta, validar } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor, ipDe, nombreVisible } from '../auth/contexto';
import {
  buscarContactos,
  cerrarSesionRemota,
  crearUsuario,
  editarUsuario,
  eliminarUsuario,
  listarRoles,
  listarTecnicos,
  listarUsuarios,
  obtenerUsuario,
} from './servicio';

export const rutasUsuarios = Router();

const esquemaBusqueda = z.object({ q: z.string().trim().max(60).optional() });

// --- Disponibles para cualquier usuario con sesión ---------------------------------

rutasUsuarios.get('/contactos', async (req, res) => {
  const { q } = validar(esquemaBusqueda, req.query);
  if (!q || q.length < 2) return void res.json([]);
  const filas = await buscarContactos(q, actor(req).id);
  res.json(filas.map((f) => ({ id: f.id, username: f.username, nombre: nombreVisible(f), email: f.email })));
});

rutasUsuarios.get('/tecnicos', async (req, res) => {
  const filas = await listarTecnicos();
  res.json(filas.map((f) => ({ id: f.id, username: f.username, nombre: nombreVisible(f) })));
});

// --- Administración ---------------------------------------------------------------

const admin = requierePermiso(PERMISOS.USUARIOS_ADMINISTRAR);

rutasUsuarios.get('/roles', admin, async (_req, res) => {
  res.json(await listarRoles());
});

rutasUsuarios.get('/', admin, async (req, res) => {
  const { q } = validar(esquemaBusqueda, req.query);
  res.json(await listarUsuarios(q));
});

rutasUsuarios.get('/:id', admin, async (req, res) => {
  res.json(await obtenerUsuario(idDeRuta(req.params.id)));
});

rutasUsuarios.post('/', admin, async (req, res) => {
  const id = await crearUsuario(req.body, actor(req).id, ipDe(req));
  res.status(201).json(await obtenerUsuario(id));
});

rutasUsuarios.put('/:id', admin, async (req, res) => {
  const id = idDeRuta(req.params.id);
  await editarUsuario(id, req.body, actor(req).id, ipDe(req));
  res.json(await obtenerUsuario(id));
});

rutasUsuarios.delete('/:id', admin, async (req, res) => {
  await eliminarUsuario(idDeRuta(req.params.id), actor(req).id, ipDe(req));
  res.status(204).end();
});

rutasUsuarios.post('/:id/cerrar-sesion', requierePermiso(PERMISOS.USUARIOS_CERRAR_SESION), async (req, res) => {
  const sesiones = await cerrarSesionRemota(idDeRuta(req.params.id), actor(req).id, ipDe(req));
  res.json({ sesionesCerradas: sesiones });
});
