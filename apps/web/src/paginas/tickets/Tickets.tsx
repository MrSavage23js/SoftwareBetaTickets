// Pantalla de tickets. Un solicitante ve "Mis tickets"; soporte ve la bandeja completa con filtros y Kanban.
// Todo el estado de la vista (estatus, búsqueda, filtros, página, vista) vive en la URL:
// se puede recargar, compartir el enlace o usar "atrás" sin perder nada.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { LISTA_ESTATUS, INFO_ESTATUS, PERMISOS, type Estatus } from '@mesa/shared';
import { Icono } from '../../componentes/Icono';
import { EstadoVacio } from '../../componentes/ui';
import { plural } from '../../lib/formato';
import { useSesion } from '../../sesion/Sesion';
import { useCatalogos, useListaTickets, useTecnicos, type Filtros } from './datos';
import { Detalle } from './Detalle';
import { Kanban } from './Kanban';
import { ListaTickets } from './Lista';
import { NuevoTicket } from './NuevoTicket';

const FILTROS_AVANZADOS = ['tipoId', 'empresaId', 'moduloId', 'asignadoAId', 'desde', 'hasta'] as const;

export function Tickets() {
  const { puede } = useSesion();
  const soporte = puede(PERMISOS.TICKETS_VER_TODOS);
  const [params] = useSearchParams();
  const ubicacion = useLocation();
  // Siempre la ubicación más reciente: la búsqueda se aplica con retraso y no debe
  // regresar a una URL vieja (p. ej. quitar el ticket que se acaba de abrir).
  const actual = useRef(ubicacion);
  actual.current = ubicacion;
  const { id } = useParams();
  const navegar = useNavigate();
  const seleccionado = id && /^\d+$/.test(id) ? Number(id) : null;

  const [nuevo, setNuevo] = useState(false);
  const [verFiltros, setVerFiltros] = useState(() => FILTROS_AVANZADOS.some((k) => params.get(k)));
  const [texto, setTexto] = useState(params.get('q') ?? '');

  const vista = soporte && params.get('vista') === 'kanban' ? 'kanban' : 'lista';
  const estatus = (params.get('estatus') ?? '') as Estatus | '';

  const cambiar = (cambios: Record<string, string | null>, reiniciarPagina = true, cerrarTicket = false) => {
    const p = new URLSearchParams(actual.current.search);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    if (reiniciarPagina) p.delete('pagina');
    navegar({ pathname: cerrarTicket ? '/tickets' : actual.current.pathname, search: p.toString() }, { replace: true });
  };

  // Búsqueda con espera corta: no se consulta en cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((new URLSearchParams(actual.current.search).get('q') ?? '') !== texto.trim()) cambiar({ q: texto.trim() });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const filtros: Filtros = useMemo(() => {
    const f: Filtros = { porPagina: 25 };
    for (const k of ['estatus', 'q', 'pagina', ...FILTROS_AVANZADOS]) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const lista = useListaTickets(filtros);
  const c = lista.data?.contadores;
  const abrir = (ticketId: number) => navegar({ pathname: `/tickets/${ticketId}`, search: params.toString() });
  const hayFiltros = FILTROS_AVANZADOS.some((k) => params.get(k));

  return (
    <>
      <header className="head">
        <div>
          <h1>{soporte ? 'Tickets' : 'Mis tickets'}</h1>
          <p>{soporte ? 'Sistema de soporte técnico' : 'Da seguimiento a tus solicitudes de soporte'}</p>
        </div>
        <div className="tools">
          <div className="search">
            <Icono n="search" />
            <input
              className="inp"
              type="search"
              aria-label="Buscar tickets"
              placeholder={soporte ? 'Buscar por folio, concepto, solicitante, empresa…' : 'Buscar por folio o concepto…'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          {soporte && (
            <button className="icon-btn" aria-label="Filtros" aria-pressed={verFiltros || hayFiltros} title="Filtros" onClick={() => setVerFiltros((v) => !v)}>
              <Icono n="filter" />
            </button>
          )}
          {puede(PERMISOS.TICKETS_CREAR) && (
            <button className="btn p" onClick={() => setNuevo(true)}>
              <Icono n="plus" />
              Nuevo ticket
            </button>
          )}
        </div>
      </header>

      <div className="bar">
        <div className="filters" role="group" aria-label="Filtrar por estatus">
          <button aria-pressed={!estatus} onClick={() => cambiar({ estatus: null })}>
            Todos {c && <span className="n">{c.total.toLocaleString('es-MX')}</span>}
          </button>
          {LISTA_ESTATUS.map((e) => (
            <button key={e} aria-pressed={estatus === e} onClick={() => cambiar({ estatus: e })}>
              {INFO_ESTATUS[e].plural} {c && <span className="n">{c[e].toLocaleString('es-MX')}</span>}
            </button>
          ))}
        </div>
        {soporte && (
          <div className="seg" role="group" aria-label="Tipo de vista">
            <button aria-pressed={vista === 'lista'} onClick={() => cambiar({ vista: null }, false, true)}>
              <Icono n="list" t="s" />
              Lista
            </button>
            <button aria-pressed={vista === 'kanban'} onClick={() => cambiar({ vista: 'kanban' }, false, true)}>
              <Icono n="kanban" t="s" />
              Kanban
            </button>
          </div>
        )}
      </div>

      {soporte && verFiltros && <PanelFiltros params={params} cambiar={cambiar} />}

      {vista === 'kanban' ? (
        <>
          <Kanban filtros={filtros} estatus={estatus} abrir={abrir} />
          {seleccionado !== null && <DetalleFlotante id={seleccionado} alCerrar={() => navegar({ pathname: '/tickets', search: params.toString() })} />}
        </>
      ) : (
        <div className="split">
          <section className="panel" aria-label="Lista de tickets">
            <div className="panel-h">
              <h2>{soporte ? (estatus ? INFO_ESTATUS[estatus].plural : 'Todos los tickets') : 'Mis solicitudes'}</h2>
              {lista.data && <span className="count">{plural(lista.data.total, 'ticket', 'tickets')}</span>}
            </div>
            <ListaTickets
              consulta={lista}
              seleccionado={seleccionado}
              abrir={abrir}
              mostrarTecnico={soporte}
              pagina={Number(params.get('pagina') ?? 1)}
              irAPagina={(p) => cambiar({ pagina: p > 1 ? String(p) : null }, false)}
              hayFiltros={!!(estatus || params.get('q') || hayFiltros)}
              alCrear={puede(PERMISOS.TICKETS_CREAR) ? () => setNuevo(true) : undefined}
            />
          </section>
          <section className="panel" aria-label="Detalle del ticket">
            {seleccionado !== null ? (
              <Detalle id={seleccionado} />
            ) : (
              <EstadoVacio icono="ticket" titulo="Selecciona un ticket" texto="Elige un ticket de la lista para ver su detalle y conversación." />
            )}
          </section>
        </div>
      )}

      {nuevo && (
        <NuevoTicket
          alCerrar={() => setNuevo(false)}
          alCrear={(ticketId) => {
            setNuevo(false);
            navegar({ pathname: `/tickets/${ticketId}`, search: params.toString() });
          }}
        />
      )}
    </>
  );
}

function PanelFiltros({ params, cambiar }: { params: URLSearchParams; cambiar: (c: Record<string, string | null>) => void }) {
  const cat = useCatalogos();
  const tecnicos = useTecnicos();
  const sel = (clave: string, etiqueta: string, opciones: { id: number | string; nombre: string }[], extra?: { valor: string; texto: string }) => (
    <div>
      <label className="lbl" htmlFor={`f-${clave}`}>
        {etiqueta}
      </label>
      <select id={`f-${clave}`} className="inp" value={params.get(clave) ?? ''} onChange={(e) => cambiar({ [clave]: e.target.value })}>
        <option value="">Todos</option>
        {extra && <option value={extra.valor}>{extra.texto}</option>}
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="panel panel-filtros" role="region" aria-label="Filtros avanzados">
      {sel('tipoId', 'Tipo', cat.data?.tipos ?? [])}
      {sel('empresaId', 'Empresa', cat.data?.empresas ?? [])}
      {sel('moduloId', 'Módulo', cat.data?.modulos ?? [])}
      {sel('asignadoAId', 'Técnico', tecnicos.data ?? [], { valor: 'ninguno', texto: 'Sin asignar' })}
      <div>
        <label className="lbl" htmlFor="f-desde">
          Desde
        </label>
        <input id="f-desde" className="inp" type="date" value={params.get('desde') ?? ''} onChange={(e) => cambiar({ desde: e.target.value })} />
      </div>
      <div>
        <label className="lbl" htmlFor="f-hasta">
          Hasta
        </label>
        <input id="f-hasta" className="inp" type="date" value={params.get('hasta') ?? ''} onChange={(e) => cambiar({ hasta: e.target.value })} />
      </div>
      <div>
        <button className="btn" style={{ width: '100%' }} onClick={() => cambiar(Object.fromEntries(FILTROS_AVANZADOS.map((k) => [k, null])))}>
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

/** En Kanban el detalle se abre en una ventana encima del tablero. */
function DetalleFlotante({ id, alCerrar }: { id: number; alCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alCerrar]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal grande" role="dialog" aria-modal="true" aria-label="Detalle del ticket">
        <div className="modal-h">
          <div className="t">
            <h2>Detalle del ticket</h2>
          </div>
          <button className="icon-btn" style={{ border: 0, background: 'transparent' }} aria-label="Cerrar" onClick={alCerrar}>
            <Icono n="x" t="l" />
          </button>
        </div>
        <Detalle id={id} />
      </div>
    </div>
  );
}
