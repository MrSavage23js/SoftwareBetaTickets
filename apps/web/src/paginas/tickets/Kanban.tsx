// Kanban: una columna por estatus, máximo 50 tarjetas visibles por columna y "Ver más" para cargar el resto.
import { useInfiniteQuery } from '@tanstack/react-query';
import { INFO_ESTATUS, LISTA_ESTATUS, type Estatus } from '@mesa/shared';
import { api } from '../../api/cliente';
import { Avatar, EstadoError } from '../../componentes/ui';
import { BadgeUrgencia, franja } from '../../componentes/Urgencia';
import { claves, type Filtros, type ListaTickets } from './datos';

const COLOR: Record<Estatus, string> = { PENDIENTE: '#B36B00', EN_PROCESO: '#2563B0', PAUSADO: '#64748B', COMPLETADO: '#1F8A55', NO_PROCEDE: '#B42318' };
const POR_COLUMNA = 50;

function Columna({ estatus, filtros, abrir }: { estatus: Estatus; filtros: Filtros; abrir: (id: number) => void }) {
  const f: Filtros = { ...filtros, estatus, porPagina: POR_COLUMNA, pagina: undefined };
  const q = useInfiniteQuery({
    queryKey: claves.columna(f),
    queryFn: ({ pageParam, signal }) => api.get<ListaTickets>('/tickets', { ...f, pagina: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.pagina * ultima.porPagina < ultima.total ? ultima.pagina + 1 : undefined),
    refetchInterval: 30_000,
  });
  const tickets = q.data?.pages.flatMap((p) => p.datos) ?? [];
  const total = q.data?.pages[0]?.total;

  return (
    <section className="col" aria-label={INFO_ESTATUS[estatus].nombre}>
      <div className="h">
        <h2>
          <i style={{ background: COLOR[estatus] }} />
          {INFO_ESTATUS[estatus].nombre}
        </h2>
        <span className="count">{total?.toLocaleString('es-MX') ?? '…'}</span>
      </div>
      {q.isPending && <div className="esqueleto" style={{ height: 120 }} />}
      {q.isError && <EstadoError error={q.error} reintentar={() => void q.refetch()} />}
      {tickets.map((t) => (
        <button key={t.id} className="kc" onClick={() => abrir(t.id)} style={franja(t.urgencia)}>
          <span className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="folio">{t.folio}</span>
            <BadgeUrgencia urgencia={t.urgencia} compacto />
          </span>
          <div className="t">{t.tipo.nombre}</div>
          <div className="s">
            {t.modulo ? `${t.modulo.nombre} · ` : ''}
            {t.empresa.nombre}
          </div>
          <div className="f">
            <span>
              <Avatar />
              {t.solicitante.nombre}
            </span>
            <span>
              {t.asignado ? (
                <>
                  <Avatar activo />
                  {t.asignado.nombre}
                </>
              ) : (
                'Sin asignar'
              )}
            </span>
          </div>
        </button>
      ))}
      {q.hasNextPage && (
        <button className="btn chico" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'Cargando…' : `Ver más (${(total ?? 0) - tickets.length} restantes)`}
        </button>
      )}
      {!q.isPending && !tickets.length && !q.isError && <div className="help" style={{ textAlign: 'center', padding: 12 }}>Sin tickets</div>}
    </section>
  );
}

export function Kanban({ filtros, estatus, abrir }: { filtros: Filtros; estatus: Estatus | ''; abrir: (id: number) => void }) {
  const columnas = estatus ? [estatus] : LISTA_ESTATUS;
  const { estatus: _e, ...resto } = filtros;
  return (
    <div className="kanban" style={estatus ? { gridTemplateColumns: 'minmax(0, 420px)' } : undefined}>
      {columnas.map((e) => (
        <Columna key={e} estatus={e} filtros={resto} abrir={abrir} />
      ))}
    </div>
  );
}
