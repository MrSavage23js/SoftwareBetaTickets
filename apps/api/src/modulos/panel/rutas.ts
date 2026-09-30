import { Router } from 'express';
import { PERMISOS } from '@mesa/shared';
import { requierePermiso } from '../../middleware/sesion';
import { resumenPanel } from './servicio';

// El acceso se verifica AQUÍ, en el servidor: ocultar el enlace en la web no basta.
// Solo el rol de administración tiene el permiso `panel.ver`.
export const rutasPanel = Router();
rutasPanel.use(requierePermiso(PERMISOS.PANEL_VER));

rutasPanel.get('/resumen', async (_req, res) => {
  res.json(await resumenPanel());
});
