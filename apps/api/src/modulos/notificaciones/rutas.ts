import { Router } from 'express';
import { idDeRuta } from '../../lib/validar';
import { actor } from '../auth/contexto';
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from './servicio';

// Cada usuario solo ve y marca SUS notificaciones (el usuario sale de la sesión, nunca de la petición).
export const rutasNotificaciones = Router();

/** ?no_leidas=1 → solo las no leídas. Siempre incluye el contador `noLeidas`. */
rutasNotificaciones.get('/', async (req, res) => {
  res.json(await listarNotificaciones(actor(req), req.query.no_leidas === '1'));
});

rutasNotificaciones.post('/leer-todas', async (req, res) => {
  res.json({ marcadas: await marcarTodasLeidas(actor(req)) });
});

rutasNotificaciones.post('/:id/leida', async (req, res) => {
  await marcarLeida(actor(req).id, idDeRuta(req.params.id));
  res.status(204).end();
});
