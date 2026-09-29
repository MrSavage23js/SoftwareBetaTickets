import { Router } from 'express';
import { PERMISOS } from '@mesa/shared';
import { idDeRuta } from '../../lib/validar';
import { requierePermiso } from '../../middleware/sesion';
import { actor, ipDe } from '../auth/contexto';
import { catalogosPara, guardarEmpresa, guardarModulo, guardarTipo } from './servicio';

export const rutasCatalogos = Router();

/** ?admin=1 (con permiso) incluye inactivos y conteos de uso. */
rutasCatalogos.get('/', async (req, res) => {
  res.json(await catalogosPara(actor(req), req.query.admin === '1'));
});

const admin = requierePermiso(PERMISOS.CATALOGOS_ADMINISTRAR);
const guardadores = { empresas: guardarEmpresa, tipos: guardarTipo, modulos: guardarModulo } as const;

for (const [ruta, guardar] of Object.entries(guardadores)) {
  rutasCatalogos.post(`/${ruta}`, admin, async (req, res) => {
    res.status(201).json(await guardar(null, req.body, actor(req).id, ipDe(req)));
  });
  rutasCatalogos.put(`/${ruta}/:id`, admin, async (req, res) => {
    res.json(await guardar(idDeRuta(req.params.id), req.body, actor(req).id, ipDe(req)));
  });
}
