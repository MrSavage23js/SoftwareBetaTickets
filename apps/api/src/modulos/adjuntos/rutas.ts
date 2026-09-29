import { existsSync } from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { PERMISOS } from '@mesa/shared';
import { db } from '../../db/conexion';
import { errores } from '../../lib/errores';
import { limiteEscritura } from '../../middleware/limites';
import { requiereAlgunPermiso } from '../../middleware/sesion';
import { actor } from '../auth/contexto';
import { empresasDe, puedeVerTicket } from '../tickets/acceso';
import { archivosDe, limpiarTemporales, MIME_IMAGEN, procesarArchivos, rutaAbsoluta, subida } from './almacenamiento';
import { insertarAdjuntos, urlAdjunto } from './servicio';

export const rutasAdjuntos = Router();

/** Imagen insertada desde el editor, antes de que exista el mensaje. Queda "temporal" hasta que se usa. */
rutasAdjuntos.post(
  '/temporal',
  requiereAlgunPermiso(PERMISOS.TICKETS_CREAR, PERMISOS.TICKETS_COMENTAR_PROPIOS, PERMISOS.TICKETS_RESPONDER),
  limiteEscritura,
  subida.single('archivo'),
  async (req, res) => {
    const archivos = archivosDe(req).concat(req.file ? [req.file] : []);
    try {
      if (!archivos.length) throw errores.archivo('No se recibió ninguna imagen.');
      const [g] = await procesarArchivos(archivos, { soloImagenes: true, maxArchivos: 1 });
      await insertarAdjuntos(db, [g!], { ticketId: null, mensajeId: null, subidoPorId: actor(req).id, enLinea: true });
      res.status(201).json({ uuid: g!.uuid, url: urlAdjunto(g!.uuid) });
    } finally {
      await limpiarTemporales(archivos);
    }
  },
);

const esquemaUuid = z.object({ uuid: z.uuid() });

rutasAdjuntos.get('/:uuid', async (req, res) => {
  const r = esquemaUuid.safeParse(req.params);
  if (!r.success) throw errores.noEncontrado('El archivo no existe.');
  const { uuid } = r.data;
  const u = actor(req);

  const a = await db
    .selectFrom('adjuntos as a')
    .leftJoin('tickets as t', 't.id', 'a.ticket_id')
    .select(['a.ruta_relativa', 'a.nombre_original', 'a.mime', 'a.tamano_bytes', 'a.ticket_id', 'a.subido_por_id', 't.solicitante_id', 't.empresa_id'])
    .where('a.uuid', '=', uuid.toLowerCase())
    .where('a.eliminado_at', 'is', null)
    .executeTakeFirst();

  const permitido =
    a &&
    (a.ticket_id === null
      ? a.subido_por_id === u.id
      : puedeVerTicket(u, { solicitante_id: a.solicitante_id!, empresa_id: a.empresa_id! }, await empresasDe(u.id)));
  // 404 también cuando no hay permiso: no se revela que el archivo existe.
  if (!a || !permitido) throw errores.noEncontrado('El archivo no existe.');

  const ruta = rutaAbsoluta(a.ruta_relativa);
  if (!existsSync(ruta)) {
    req.log.error({ uuid }, 'Adjunto registrado en BD pero ausente en disco');
    throw errores.noEncontrado('El archivo ya no está disponible. Avisa al administrador.');
  }

  // Solo imágenes y PDF se muestran en el navegador; lo demás siempre se descarga.
  const enLinea = MIME_IMAGEN.has(a.mime) || a.mime === 'application/pdf';
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Length', String(a.tamano_bytes));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader(
    'Content-Disposition',
    `${enLinea ? 'inline' : 'attachment'}; filename="${a.nombre_original.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(a.nombre_original)}`,
  );
  res.sendFile(ruta);
});
