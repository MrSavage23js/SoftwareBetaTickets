// Campana de notificaciones: contador de no leídas y panel con las recientes y enlace al ticket.
// Se actualiza sola cada 20 s (consulta automática: no cuenta como actividad para la inactividad).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListaNotificaciones } from '@mesa/shared';
import { api } from '../api/cliente';
import { fmtFechaHora } from '../lib/formato';
import { Icono } from './Icono';

const CLAVE = ['notificaciones'] as const;

export function Campana() {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => api.get<ListaNotificaciones>('/notificaciones', undefined, signal),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const noLeidas = q.data?.noLeidas ?? 0;

  // Al abrir, trae lo más reciente; se cierra con Escape o al hacer clic fuera.
  useEffect(() => {
    if (!abierta) return;
    void q.refetch();
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const refrescar = () => void qc.invalidateQueries({ queryKey: CLAVE });
  const leer = (id: number) => void api.post(`/notificaciones/${id}/leida`).then(refrescar).catch(() => undefined);

  return (
    <div className="campana" ref={caja}>
      <button
        type="button"
        aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
        aria-haspopup="true"
        title="Notificaciones"
        onClick={() => setAbierta((v) => !v)}
      >
        <Icono n="bell" t="l" />
        {noLeidas > 0 && (
          <span className="contador" aria-hidden="true">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <header>
            <b>Notificaciones</b>
            {noLeidas > 0 && (
              <button type="button" className="btn chico" onClick={() => void api.post('/notificaciones/leer-todas').then(refrescar)}>
                Marcar todas como leídas
              </button>
            )}
          </header>
          {q.isError ? (
            <div className="vacia">No se pudieron cargar las notificaciones.</div>
          ) : !q.data ? (
            <div className="vacia">Cargando…</div>
          ) : !q.data.datos.length ? (
            <div className="vacia">No tienes notificaciones.</div>
          ) : (
            <ul>
              {q.data.datos.map((n) => (
                <li key={n.id} className={n.leida ? '' : 'nueva'}>
                  <Link
                    to={`/tickets/${n.ticket.id}`}
                    onClick={() => {
                      if (!n.leida) leer(n.id);
                      setAbierta(false);
                    }}
                  >
                    <span className="punto" aria-hidden="true" />
                    <span>
                      <span className="texto">{n.mensaje}</span>
                      <small>
                        {n.leida ? '' : 'Nueva · '}
                        {fmtFechaHora(n.creadoAt)}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
