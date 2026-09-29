import { Router } from 'express';
import { z } from 'zod';
import { PERMISOS } from '@mesa/shared';
import { env } from '../../config/env';
import { db } from '../../db/conexion';
import { validar } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor, ipDe } from '../auth/contexto';
import { auditar } from '../eventos/servicio';
import { actualizarAjustes, listarAjustes } from './servicio';

export const rutasAjustes = Router();
const admin = requierePermiso(PERMISOS.AJUSTES_ADMINISTRAR);

rutasAjustes.get('/', admin, async (_req, res) => {
  res.json({
    ajustes: await listarAjustes(),
    // Valores de .env que no se editan desde la pantalla pero conviene ver.
    servidor: {
      transporteCorreo: env.MAIL_TRANSPORT,
      remitente: env.MAIL_FROM,
      adjuntosTechoMb: env.ADJUNTOS_TECHO_MB,
      zonaHoraria: env.APP_TZ,
      url: env.APP_URL,
    },
  });
});

rutasAjustes.put('/', admin, async (req, res) => {
  const cambios = validar(z.record(z.string(), z.unknown()), req.body);
  const detalle = await actualizarAjustes(cambios, actor(req).id);
  await auditar(db, { actorId: actor(req).id, entidad: 'ajustes', entidadId: '-', accion: 'EDITADOS', ip: ipDe(req), datos: detalle });
  res.json({ ajustes: await listarAjustes() });
});
