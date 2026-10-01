import { Router, type RequestHandler } from 'express';
import { PERMISOS } from '@mesa/shared';
import { idDeRuta, jsonDeFormulario } from '../../lib/validar';
import { limiteEscritura } from '../../middleware/limites';
import { requiereAlgunPermiso, requierePermiso } from '../../middleware/sesion';
import { archivosDe, limpiarTemporales, subida } from '../adjuntos/almacenamiento';
import { actor } from '../auth/contexto';
import { detalleTicket, historialTicket, listarTickets } from './consultas';
import * as op from './operaciones';

export const rutasTickets = Router();

const verAlguno = requiereAlgunPermiso(PERMISOS.TICKETS_VER_PROPIOS, PERMISOS.TICKETS_VER_EMPRESA, PERMISOS.TICKETS_VER_TODOS);

/** Formularios con archivos: campo "datos" (JSON) + archivos en "archivos". Borra temporales al terminar. */
function conFormulario(hacer: (req: Parameters<RequestHandler>[0], datos: unknown, archivos: Express.Multer.File[]) => Promise<unknown>): RequestHandler[] {
  return [
    limiteEscritura,
    subida.array('archivos', 20),
    async (req, res) => {
      const archivos = archivosDe(req);
      try {
        const datos = req.is('multipart/form-data') ? jsonDeFormulario(req.body?.datos) : req.body;
        const r = await hacer(req, datos, archivos);
        if (r === undefined) res.status(204).end();
        else res.status(201).json(r);
      } finally {
        await limpiarTemporales(archivos);
      }
    },
  ];
}

rutasTickets.get('/', verAlguno, async (req, res) => {
  res.json(await listarTickets(actor(req), req.query as Record<string, unknown>));
});

rutasTickets.post(
  '/',
  requierePermiso(PERMISOS.TICKETS_CREAR),
  ...conFormulario((req, datos, archivos) => op.crearTicket(actor(req), datos, archivos)),
);

rutasTickets.get('/:id', verAlguno, async (req, res) => {
  res.json(await detalleTicket(actor(req), idDeRuta(req.params.id)));
});

rutasTickets.get('/:id/historial', requierePermiso(PERMISOS.TICKETS_VER_HISTORIAL), async (req, res) => {
  res.json(await historialTicket(actor(req), idDeRuta(req.params.id)));
});

// Los permisos finos (quién, desde qué estatus) los decide la máquina de estados dentro de cada operación.
rutasTickets.post('/:id/tomar', async (req, res) => {
  await op.tomar(actor(req), idDeRuta(req.params.id));
  res.status(204).end();
});
rutasTickets.post('/:id/pausar', async (req, res) => {
  await op.pausar(actor(req), idDeRuta(req.params.id), req.body);
  res.status(204).end();
});
rutasTickets.post('/:id/reanudar', async (req, res) => {
  await op.reanudar(actor(req), idDeRuta(req.params.id), req.body);
  res.status(204).end();
});
rutasTickets.post('/:id/reasignar', async (req, res) => {
  await op.reasignar(actor(req), idDeRuta(req.params.id), req.body);
  res.status(204).end();
});
rutasTickets.post('/:id/no-procede', async (req, res) => {
  await op.noProcede(actor(req), idDeRuta(req.params.id), req.body);
  res.status(204).end();
});
rutasTickets.post('/:id/reabrir', async (req, res) => {
  await op.reabrir(actor(req), idDeRuta(req.params.id), req.body);
  res.status(204).end();
});
rutasTickets.post(
  '/:id/comentarios',
  ...conFormulario(async (req, datos, archivos) => void (await op.comentar(actor(req), idDeRuta(req.params.id), datos, archivos))),
);
rutasTickets.post(
  '/:id/respuestas',
  ...conFormulario(async (req, datos, archivos) => void (await op.responder(actor(req), idDeRuta(req.params.id), datos, archivos))),
);
rutasTickets.post(
  '/:id/cerrar',
  ...conFormulario(async (req, datos, archivos) => void (await op.cerrar(actor(req), idDeRuta(req.params.id), datos, archivos))),
);
