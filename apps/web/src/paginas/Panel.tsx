// Dashboard de administración: resumen numérico, dos gráficas y tabla de tickets con filtros.
// La web solo muestra el enlace a quien tiene `panel.ver`; el servidor vuelve a verificarlo (403).
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { INFO_ESTATUS, INFO_URGENCIA, LISTA_ESTATUS, URGENCIAS_DESC, type PanelResumen, type Urgencia } from '@mesa/shared';
import { api } from '../api/cliente';
import { GraficaBarras } from '../componentes/GraficaBarras';
import { Icono } from '../componentes/Icono';
import { BadgeUrgencia, franja, Nivel } from '../componentes/Urgencia';
import { Cargando, EstadoError, EstadoVacio, PillEstatus } from '../componentes/ui';
import { fmtFechaCorta, fmtFechaHora, plural } from '../lib/formato';
import { useCatalogos, type ListaTickets } from './tickets/datos';

const FILTROS = ['estatus', 'urgencia', 'departamentoId', 'desde', 'hasta', 'orden', 'pagina'] as const;
/** Color único para magnitud (tickets por departamento): el acento del sistema. */
const COLOR_DEPTO = '#0E7C7B';

export function Panel() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const cat = useCatalogos();

  const resumen = useQuery({
    queryKey: ['panel', 'resumen'],
    queryFn: ({ signal }) => api.get<PanelResumen>('/panel/resumen', undefined, signal),
    refetchInterval: 30_000,
  });

  const filtros = useMemo(() => {
    const f: Record<string, string | number> = { porPagina: 20, orden: 'urgencia' };
    for (const k of FILTROS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const tabla = useQuery({
    queryKey: ['tickets', 'lista', 'panel', filtros],
    queryFn: ({ signal }) => api.get<ListaTickets>('/tickets', filtros, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const cambiar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    if (!('pagina' in cambios)) p.delete('pagina');
    setParams(p, { replace: true });
  };

  const r = resumen.data;
  const tarjetas = r
    ? [
        { t: 'Abiertos', v: r.abiertos, d: `${r.pendientes} pendientes · ${r.pausados} pausados`, filtro: null },
        { t: 'En proceso', v: r.enProceso, d: 'Tomados por un técnico', filtro: { estatus: 'EN_PROCESO' } },
        { t: 'Cerrados hoy', v: r.cerradosHoy, d: 'Desde las 00:00', filtro: null },
        { t: 'Cerrados esta semana', v: r.cerradosSemana, d: 'Desde el lunes', filtro: null },
        { t: 'Críticos sin atender', v: r.criticosSinAtender, d: 'Pendientes · urgencia crítica', filtro: { estatus: 'PENDIENTE', urgencia: 'CRITICA' }, urg: 'CRITICA' as Urgencia },
        { t: 'Altos sin atender', v: r.altosSinAtender, d: 'Pendientes · urgencia alta', filtro: { estatus: 'PENDIENTE', urgencia: 'ALTA' }, urg: 'ALTA' as Urgencia },
      ]
    : [];

  const paginas = tabla.data ? Math.max(1, Math.ceil(tabla.data.total / tabla.data.porPagina)) : 1;
  const pagina = Number(params.get('pagina') ?? 1);
  const hayFiltros = FILTROS.some((k) => k !== 'orden' && k !== 'pagina' && params.get(k));

  return (
    <>
      <header className="head">
        <div>
          <h1>Dashboard</h1>
          <p>{r ? `Actualizado ${fmtFechaHora(r.generadoAt)} · se refresca cada 30 s` : 'Resumen de la mesa de ayuda'}</p>
        </div>
      </header>

      <div className="pagina" style={{ paddingTop: 20 }}>
        {resumen.isPending ? (
          <Cargando />
        ) : resumen.isError ? (
          <EstadoError error={resumen.error} reintentar={() => void resumen.refetch()} />
        ) : (
          <>
            <section className="tarjetas" aria-label="Resumen">
              {tarjetas.map((c) => {
                const contenido = (
                  <>
                    <small style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.urg && <Nivel urgencia={c.urg} />}
                      {c.t}
                    </small>
                    <b>{c.v.toLocaleString('es-MX')}</b>
                    <span>{c.d}</span>
                  </>
                );
                const estilo = { textAlign: 'left' as const, ...(c.urg && c.v > 0 ? { borderColor: INFO_URGENCIA[c.urg].color } : {}) };
                const clase = `tarjeta ${c.urg && c.v > 0 ? 'alerta' : ''}`;
                // Solo las tarjetas que filtran la tabla son botones; las demás son texto (sin atenuar).
                return c.filtro ? (
                  <button
                    key={c.t}
                    type="button"
                    className={clase}
                    style={{ ...estilo, cursor: 'pointer' }}
                    onClick={() => cambiar(Object.assign({ estatus: null, urgencia: null, departamentoId: null }, c.filtro))}
                    title="Clic para ver estos tickets en la tabla"
                  >
                    {contenido}
                  </button>
                ) : (
                  <div key={c.t} className={clase} style={estilo}>
                    {contenido}
                  </div>
                );
              })}
            </section>

            <div className="graficas">
              <section className="panel">
                <div className="panel-h">
                  <h2>Abiertos por urgencia</h2>
                  <span className="count">{plural(r!.abiertos, 'ticket', 'tickets')}</span>
                </div>
                <GraficaBarras
                  descripcion="Tickets abiertos por urgencia"
                  unidad={['ticket abierto', 'tickets abiertos']}
                  datos={r!.abiertosPorUrgencia.map((x) => ({
                    clave: x.urgencia,
                    etiqueta: INFO_URGENCIA[x.urgencia].nombre,
                    valor: x.total,
                    color: INFO_URGENCIA[x.urgencia].color,
                    marca: <Nivel urgencia={x.urgencia} />,
                  }))}
                  alElegir={(u) => cambiar({ urgencia: u, estatus: null })}
                />
              </section>
              <section className="panel">
                <div className="panel-h">
                  <h2>Abiertos por departamento</h2>
                  <span className="count">{plural(r!.abiertosPorDepartamento.length, 'departamento', 'departamentos')}</span>
                </div>
                {r!.abiertosPorDepartamento.length ? (
                  <GraficaBarras
                    descripcion="Tickets abiertos por departamento"
                    unidad={['ticket abierto', 'tickets abiertos']}
                    datos={r!.abiertosPorDepartamento.map((d) => ({ clave: String(d.id), etiqueta: `${d.nombre} (${d.codigo})`, valor: d.total, color: COLOR_DEPTO }))}
                    alElegir={(id) => cambiar({ departamentoId: id })}
                  />
                ) : (
                  <EstadoVacio icono="chart" titulo="Sin departamentos" />
                )}
              </section>
            </div>
          </>
        )}

        <section className="panel">
          <div className="panel-h" style={{ flexWrap: 'wrap' }}>
            <h2>Tickets</h2>
            {tabla.data && <span className="count">{plural(tabla.data.total, 'ticket', 'tickets')}</span>}
          </div>
          <div className="panel-filtros" style={{ margin: 0, borderBottom: '1px solid var(--line-2)' }} role="region" aria-label="Filtros de la tabla">
            <div>
              <label className="lbl" htmlFor="p-estatus">Estado</label>
              <select id="p-estatus" className="inp" value={params.get('estatus') ?? ''} onChange={(e) => cambiar({ estatus: e.target.value })}>
                <option value="">Todos</option>
                {LISTA_ESTATUS.map((e) => (
                  <option key={e} value={e}>{INFO_ESTATUS[e].nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="p-urgencia">Urgencia</label>
              <select id="p-urgencia" className="inp" value={params.get('urgencia') ?? ''} onChange={(e) => cambiar({ urgencia: e.target.value })}>
                <option value="">Todas</option>
                {URGENCIAS_DESC.map((u) => (
                  <option key={u} value={u}>{INFO_URGENCIA[u].nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="p-depto">Departamento</label>
              <select id="p-depto" className="inp" value={params.get('departamentoId') ?? ''} onChange={(e) => cambiar({ departamentoId: e.target.value })}>
                <option value="">Todos</option>
                {(cat.data?.departamentos ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="p-desde">Desde</label>
              <input id="p-desde" className="inp" type="date" value={params.get('desde') ?? ''} onChange={(e) => cambiar({ desde: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="p-hasta">Hasta</label>
              <input id="p-hasta" className="inp" type="date" value={params.get('hasta') ?? ''} onChange={(e) => cambiar({ hasta: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="p-orden">Ordenar por</label>
              <select id="p-orden" className="inp" value={params.get('orden') ?? 'urgencia'} onChange={(e) => cambiar({ orden: e.target.value })}>
                <option value="urgencia">Urgencia</option>
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
              </select>
            </div>
            <div>
              <button className="btn" style={{ width: '100%' }} disabled={!hayFiltros} onClick={() => cambiar({ estatus: null, urgencia: null, departamentoId: null, desde: null, hasta: null })}>
                Limpiar filtros
              </button>
            </div>
          </div>

          {tabla.isPending ? (
            <Cargando />
          ) : tabla.isError && !tabla.data ? (
            <EstadoError error={tabla.error} reintentar={() => void tabla.refetch()} />
          ) : !tabla.data.datos.length ? (
            <EstadoVacio icono="search" titulo={hayFiltros ? 'Sin resultados' : 'Aún no hay tickets'} texto={hayFiltros ? 'Ningún ticket coincide con los filtros.' : undefined} />
          ) : (
            <>
              <div className="tabla-caja">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Urgencia</th>
                      <th>Folio</th>
                      <th>Estado</th>
                      <th>Departamento</th>
                      <th>Tipo</th>
                      <th>Solicitante</th>
                      <th>Asignado a</th>
                      <th>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabla.data.datos.map((t) => (
                      <tr
                        key={t.id}
                        className="clic"
                        tabIndex={0}
                        onClick={() => navegar(`/tickets/${t.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navegar(`/tickets/${t.id}`)}
                        aria-label={`Abrir ${t.folio}`}
                      >
                        <td style={franja(t.urgencia)}>
                          <BadgeUrgencia urgencia={t.urgencia} />
                        </td>
                        <td className="folio">{t.folio}</td>
                        <td><PillEstatus estatus={t.estatus} /></td>
                        <td>{t.departamento.nombre}</td>
                        <td>{t.tipo.nombre}</td>
                        <td>{t.solicitante.nombre}</td>
                        <td className={t.asignado ? '' : 'ph'}>{t.asignado?.nombre ?? 'Sin asignar'}</td>
                        <td className="ph">{fmtFechaCorta(t.creadoAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paginas > 1 && (
                <div className="paginacion">
                  <span>Página {pagina} de {paginas}</span>
                  <div>
                    <button className="btn chico" disabled={pagina <= 1} onClick={() => cambiar({ pagina: String(pagina - 1) })}>Anterior</button>
                    <button className="btn chico" disabled={pagina >= paginas} onClick={() => cambiar({ pagina: String(pagina + 1) })}>Siguiente</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        <p className="help" style={{ margin: 0 }}>
          <Icono n="alert" t="s" /> La urgencia siempre se muestra con su nombre y nivel (1 a 4 barras), no solo con color.
        </p>
      </div>
    </>
  );
}
