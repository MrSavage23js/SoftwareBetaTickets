import { Router } from 'express';
import { PERIODOS_PANEL, PERMISOS, type PeriodoPanel } from '@mesa/shared';
import { errores } from '../../lib/errores';
import { hoyLocal } from '../../lib/fechas';
import { requierePermiso } from '../../middleware/sesion';
import { analiticaPanel, exportarTicketsCsv } from './analitica';
import { resumenPanel } from './servicio';

// El acceso se verifica AQUÍ, en el servidor: ocultar el enlace en la web no basta.
// Solo el rol de administración tiene el permiso `panel.ver`.
export const rutasPanel = Router();
rutasPanel.use(requierePermiso(PERMISOS.PANEL_VER));

function periodo(v: unknown, porOmision: PeriodoPanel | null): PeriodoPanel | null {
  if (v === undefined || v === '') return porOmision;
  if (v === 'todo') return null;
  const n = Number(v);
  if (!(PERIODOS_PANEL as readonly number[]).includes(n)) throw errores.validacion(`Periodo no válido. Usa ${PERIODOS_PANEL.join(', ')} o "todo".`);
  return n as PeriodoPanel;
}

rutasPanel.get('/resumen', async (_req, res) => {
  res.json(await resumenPanel());
});

rutasPanel.get('/analitica', async (req, res) => {
  res.json(await analiticaPanel(periodo(req.query.dias, 30) ?? 30));
});

/** Tabla plana de tickets en CSV (Power BI: Obtener datos → Texto/CSV; también abre en Excel). */
rutasPanel.get('/exportar.csv', async (req, res) => {
  const dias = periodo(req.query.dias, null);
  const csv = await exportarTicketsCsv(dias);
  const nombre = `tickets_${dias ? `${dias}dias` : 'todo'}_${hoyLocal()}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});
