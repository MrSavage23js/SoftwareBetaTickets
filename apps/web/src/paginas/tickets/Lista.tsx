import { Fragment } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TicketResumen } from '@mesa/shared';
import { Icono } from '../../componentes/Icono';
import { BadgeUrgencia, franja } from '../../componentes/Urgencia';
import { Avatar, EstadoError, EstadoVacio, Esqueletos, PillEstatus } from '../../componentes/ui';
import { claveDia, etiquetaDia, fmtHora } from '../../lib/formato';
import type { ListaTickets as Datos } from './datos';

export function TarjetaTicket({ t, sel, mostrarTecnico, alAbrir }: { t: TicketResumen; sel: boolean; mostrarTecnico: boolean; alAbrir: () => void }) {
  return (
    <button className={`tk ${sel ? 'sel' : ''}`} onClick={alAbrir} aria-current={sel || undefined} style={franja(t.urgencia)}>
      <span className="row">
        <span className="folio">{t.folio}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <BadgeUrgencia urgencia={t.urgencia} compacto />
          <PillEstatus estatus={t.estatus} />
        </span>
      </span>
      <span className="t">
        {t.tipo.nombre} {t.modulo && <span>· {t.modulo.nombre}</span>}
      </span>
      <span className="row">
        <span className="s">
          <Avatar />
          {t.solicitante.nombre}
        </span>
        <span className="s">{fmtHora(t.creadoAt)}</span>
      </span>
      <span className="s">
        {t.empresa.nombre}
        {mostrarTecnico && t.asignado && <> · <span style={{ color: 'var(--accent-text)' }}>{t.asignado.nombre}</span></>}
      </span>
    </button>
  );
}

export function ListaTickets({
  consulta,
  seleccionado,
  abrir,
  mostrarTecnico,
  pagina,
  irAPagina,
  hayFiltros,
  alCrear,
}: {
  consulta: UseQueryResult<Datos>;
  seleccionado: number | null;
  abrir: (id: number) => void;
  mostrarTecnico: boolean;
  pagina: number;
  irAPagina: (p: number) => void;
  hayFiltros: boolean;
  alCrear?: () => void;
}) {
  const { data, isPending, isError, error, refetch, isFetching } = consulta;
  if (isPending) return <Esqueletos n={4} />;
  if (isError && !data) return <EstadoError error={error} reintentar={() => void refetch()} />;
  if (!data.datos.length) {
    return hayFiltros ? (
      <EstadoVacio icono="search" titulo="Sin resultados" texto="Ningún ticket coincide con la búsqueda o los filtros." />
    ) : (
      <EstadoVacio icono="ticket" titulo="Aún no hay tickets" texto="Cuando se cree un ticket aparecerá aquí.">
        {alCrear && (
          <button className="btn p" onClick={alCrear}>
            <Icono n="plus" />
            Nuevo ticket
          </button>
        )}
      </EstadoVacio>
    );
  }

  const paginas = Math.max(1, Math.ceil(data.total / data.porPagina));
  let diaAnterior = '';
  return (
    <>
      <div className="list" aria-busy={isFetching}>
        {isError && <div className="notice mal">No se pudo actualizar la lista; se muestran los últimos datos.</div>}
        {data.datos.map((t) => {
          const dia = claveDia(t.creadoAt);
          const titulo = dia !== diaAnterior ? etiquetaDia(t.creadoAt) : null;
          diaAnterior = dia;
          return (
            <Fragment key={t.id}>
              {titulo && <div className="day">{titulo}</div>}
              <TarjetaTicket t={t} sel={t.id === seleccionado} mostrarTecnico={mostrarTecnico} alAbrir={() => abrir(t.id)} />
            </Fragment>
          );
        })}
      </div>
      {paginas > 1 && (
        <div className="paginacion">
          <span>
            Página {pagina} de {paginas}
          </span>
          <div>
            <button className="btn chico" disabled={pagina <= 1} onClick={() => irAPagina(pagina - 1)}>
              Anterior
            </button>
            <button className="btn chico" disabled={pagina >= paginas} onClick={() => irAPagina(pagina + 1)}>
              Siguiente
            </button>
          </div>
        </div>
      )}
    </>
  );
}
