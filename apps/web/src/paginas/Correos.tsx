import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISOS, type CorreoFila, type Paginado, type PlantillaFila } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Cargando, EstadoError, EstadoVacio, useAvisos } from '../componentes/ui';
import { fmtFechaCorta, plural } from '../lib/formato';
import { useSesion } from '../sesion/Sesion';

type Cola = Paginado<CorreoFila> & { transporte: string; resumen: Record<string, number> };

const ESTADOS: Record<CorreoFila['estado'], [string, string]> = {
  PENDIENTE: ['Pendiente', 'pend'],
  ENVIANDO: ['Enviando', 'proc'],
  ENVIADO: ['Enviado', 'on'],
  FALLIDO: ['Fallido', 'mal'],
  CANCELADO: ['Cancelado', 'off'],
};

export function Correos() {
  const { puede } = useSesion();
  const verCola = puede(PERMISOS.CORREOS_COLA);
  const verPlantillas = puede(PERMISOS.CORREOS_PLANTILLAS);
  const [pestana, setPestana] = useState<'cola' | 'plantillas'>(verCola ? 'cola' : 'plantillas');
  return (
    <>
      <header className="head">
        <div>
          <h1>Correos</h1>
          <p>Cola de salida y plantillas de los avisos que se envían a Outlook</p>
        </div>
      </header>
      <div className="bar">
        <div className="seg" role="tablist" aria-label="Sección">
          {verCola && (
            <button role="tab" aria-selected={pestana === 'cola'} onClick={() => setPestana('cola')}>
              Cola de salida
            </button>
          )}
          {verPlantillas && (
            <button role="tab" aria-selected={pestana === 'plantillas'} onClick={() => setPestana('plantillas')}>
              Plantillas
            </button>
          )}
        </div>
      </div>
      <div className="pagina">{pestana === 'cola' ? <ColaSalida /> : <Plantillas />}</div>
    </>
  );
}

function ColaSalida() {
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const avisar = useAvisos();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['correos', estado, pagina],
    queryFn: ({ signal }) => api.get<Cola>('/correos', { estado, pagina }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  async function reintentar(id: number) {
    try {
      await api.post(`/correos/${id}/reintentar`);
      avisar('El correo volvió a la cola.');
      void qc.invalidateQueries({ queryKey: ['correos'] });
    } catch (e) {
      avisar(mensajeDe(e), 'mal');
    }
  }

  const paginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Cola de salida</h2>
        <div className="tools">
          {q.data && (
            <span className="help" style={{ margin: 0 }}>
              Envío: <b>{q.data.transporte}</b> · Pendientes {q.data.resumen.PENDIENTE ?? 0} · Fallidos {q.data.resumen.FALLIDO ?? 0}
            </span>
          )}
          <select className="inp" style={{ width: 180, minHeight: 36 }} aria-label="Filtrar por estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, [t]]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {q.data?.transporte === 'consola' && (
        <div className="notice gray" style={{ margin: 16 }}>
          <Icono n="alert" t="l" />
          <span>Modo consola: los correos NO salen a Outlook; se guardan como archivos .eml en storage/correos-consola. Cambia MAIL_TRANSPORT en .env para enviarlos.</span>
        </div>
      )}
      {q.isPending ? (
        <Cargando />
      ) : q.isError ? (
        <EstadoError error={q.error} reintentar={() => void q.refetch()} />
      ) : !q.data.datos.length ? (
        <EstadoVacio icono="mail" titulo="No hay correos" />
      ) : (
        <>
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Creado</th>
                  <th>Ticket</th>
                  <th>Para</th>
                  <th>Asunto</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.datos.map((c) => (
                  <tr key={c.id}>
                    <td className="ph">{c.id}</td>
                    <td className="ph">{fmtFechaCorta(c.creadoAt)}</td>
                    <td className="folio">{c.ticketFolio ?? '—'}</td>
                    <td>{c.para.map((p) => p.email).join(', ')}</td>
                    <td>
                      {c.asunto}
                      {c.ultimoError && (
                        <div className="err" style={{ fontWeight: 400 }} title={c.ultimoError}>
                          {c.ultimoError.slice(0, 140)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${ESTADOS[c.estado][1]}`}>{ESTADOS[c.estado][0]}</span>
                      {c.proximoIntentoAt && c.intentos > 0 && <div className="help">Reintento: {fmtFechaCorta(c.proximoIntentoAt)}</div>}
                    </td>
                    <td className="ph">{c.intentos}</td>
                    <td className="acc">
                      {(c.estado === 'FALLIDO' || c.estado === 'CANCELADO') && (
                        <button className="btn chico" onClick={() => void reintentar(c.id)}>
                          <Icono n="refresh" t="s" />
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="paginacion">
            <span>{plural(q.data.total, 'correo', 'correos')} · Página {pagina} de {paginas}</span>
            <div>
              <button className="btn chico" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
              <button className="btn chico" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Plantillas() {
  const q = useQuery({ queryKey: ['plantillas'], queryFn: ({ signal }) => api.get<PlantillaFila[]>('/correos/plantillas', undefined, signal) });
  const [sel, setSel] = useState<number | null>(null);
  if (q.isPending) return <Cargando />;
  if (q.isError) return <EstadoError error={q.error} reintentar={() => void q.refetch()} />;
  const actual = q.data.find((p) => p.id === sel) ?? q.data[0];
  return (
    <div className="split" style={{ padding: 0 }}>
      <section className="panel">
        <div className="panel-h">
          <h2>Plantillas</h2>
        </div>
        <div className="list">
          {q.data.map((p) => (
            <button key={p.id} className={`tk ${p.id === actual?.id ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
              <span className="row">
                <span className="t">{p.nombre}</span>
                {!p.activa && <span className="pill off">Inactiva</span>}
              </span>
              <span className="s">{p.descripcion}</span>
              <span className="folio">{p.codigo}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">{actual && <EditorPlantilla key={actual.id} p={actual} />}</section>
    </div>
  );
}

function EditorPlantilla({ p }: { p: PlantillaFila }) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [asunto, setAsunto] = useState(p.asunto);
  const [cuerpo, setCuerpo] = useState(p.cuerpoHtml);
  const [activa, setActiva] = useState(p.activa);
  const [previa, setPrevia] = useState<{ asunto: string; html: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  // Vista previa con datos de ejemplo, actualizada al dejar de escribir.
  useEffect(() => {
    const t = window.setTimeout(() => {
      api
        .post<{ asunto: string; html: string }>('/correos/plantillas/vista-previa', { asunto: asunto || ' ', cuerpoHtml: cuerpo || ' ' })
        .then(setPrevia)
        .catch(() => setPrevia(null));
    }, 500);
    return () => window.clearTimeout(t);
  }, [asunto, cuerpo]);

  async function guardar() {
    setGuardando(true);
    try {
      await api.put(`/correos/plantillas/${p.id}`, { asunto, cuerpoHtml: cuerpo, activa });
      avisar('Plantilla guardada.');
      setErrores({});
      void qc.invalidateQueries({ queryKey: ['plantillas'] });
    } catch (e) {
      setErrores(camposDe(e));
      avisar(mensajeDe(e), 'mal');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="detail">
      <div className="top">
        <div className="l">
          <h3 style={{ margin: 0 }}>{p.nombre}</h3>
          <span className="folio">{p.codigo}</span>
        </div>
        <div className="r">
          <label className="check">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            Activa
          </label>
          <button className="btn p" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      <p className="help" style={{ margin: 0 }}>{p.descripcion}</p>
      <div>
        <label className="lbl" htmlFor="pl-asunto">Asunto</label>
        <input id="pl-asunto" className="inp" value={asunto} onChange={(e) => setAsunto(e.target.value)} aria-invalid={!!errores.asunto} />
        {errores.asunto && <div className="err">{errores.asunto}</div>}
      </div>
      <div className="box" style={{ padding: 14 }}>
        <b style={{ fontSize: 14 }}>Variables disponibles</b>
        <div className="chips">
          {p.variables.map((v) => (
            <button
              key={v.nombre}
              type="button"
              className="chip"
              style={{ paddingRight: 12 }}
              title={v.descripcion}
              onClick={() => setCuerpo((c) => `${c}${v.nombre.endsWith('_html') ? `{{{${v.nombre}}}}` : `{{${v.nombre}}}`}`)}
            >
              {v.nombre.endsWith('_html') ? `{{{${v.nombre}}}}` : `{{${v.nombre}}}`}
            </button>
          ))}
        </div>
        <span className="help" style={{ margin: 0 }}>
          Clic para agregar al final del cuerpo. <code>{'{{variable}}'}</code> inserta texto; <code>{'{{{variable_html}}}'}</code> inserta contenido con formato.
        </span>
      </div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <div>
          <label className="lbl" htmlFor="pl-cuerpo">Cuerpo (HTML)</label>
          <textarea id="pl-cuerpo" className="inp codigo" spellCheck={false} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
          <div className="help">Al guardar se eliminan scripts y elementos no permitidos.</div>
        </div>
        <div>
          <span className="lbl">Vista previa (datos de ejemplo)</span>
          {previa ? (
            <>
              <div className="cell" style={{ marginBottom: 8 }}>
                <small>Asunto</small>
                <div>{previa.asunto}</div>
              </div>
              <iframe className="previa" title="Vista previa del correo" sandbox="" srcDoc={previa.html} />
            </>
          ) : (
            <Cargando texto="Generando vista previa…" />
          )}
        </div>
      </div>
    </div>
  );
}
