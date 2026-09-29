import { useState } from 'react';
import { PERMISOS, pasosCompletados, INFO_ESTATUS, type EventoInfo, type TicketDetalle } from '@mesa/shared';
import { api, camposDe, ErrorCliente, mensajeDe } from '../../api/cliente';
import { ListaAdjuntos, SelectorArchivos } from '../../componentes/Archivos';
import { Editor } from '../../componentes/Editor';
import { Icono, type NombreIcono } from '../../componentes/Icono';
import { Avatar, Cargando, EstadoError, Modal, PillEstatus, useAvisos } from '../../componentes/ui';
import { fmtFechaHora } from '../../lib/formato';
import { useSesion } from '../../sesion/Sesion';
import { useDetalle, useHistorial, useRefrescarTickets, useTecnicos } from './datos';

type Ventana = 'pausar' | 'reasignar' | 'cerrar' | null;

export function Detalle({ id }: { id: number }) {
  const q = useDetalle(id);
  if (q.isPending) return <Cargando texto="Cargando ticket…" />;
  if (q.isError) return <EstadoError error={q.error} reintentar={() => void q.refetch()} />;
  return <Contenido t={q.data} />;
}

function Contenido({ t }: { t: TicketDetalle }) {
  const { puede, usuario } = useSesion();
  const avisar = useAvisos();
  const refrescar = useRefrescarTickets();
  const [ventana, setVentana] = useState<Ventana>(null);
  const [ocupado, setOcupado] = useState(false);
  const soporte = puede(PERMISOS.TICKETS_VER_TODOS);
  const a = new Set(t.acciones);
  const pasos = pasosCompletados(t);

  async function ejecutar(accion: string, cuerpo: unknown, exito: string) {
    setOcupado(true);
    try {
      await api.post(`/tickets/${t.id}/${accion}`, cuerpo);
      avisar(exito);
      refrescar(t.id);
      return true;
    } catch (e) {
      avisar(mensajeDe(e), 'mal');
      // Si otro técnico lo cambió (409) se recarga para mostrar el estado real.
      if (e instanceof ErrorCliente && e.estado === 409) refrescar(t.id);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const botonAccion = (icono: NombreIcono, texto: string, onClick: () => void, primario = false) => (
    <button className={`btn ${primario ? 'p' : ''}`} onClick={onClick} disabled={ocupado}>
      <Icono n={icono} t="s" />
      {texto}
    </button>
  );

  return (
    <div className="detail">
      <div className="top">
        <div className="l">
          <span className="folio">{t.folio}</span>
          <PillEstatus estatus={t.estatus} />
          <span className="pill type">{t.tipo.nombre}</span>
        </div>
        <div className="r">
          {a.has('tomar') && botonAccion('check', 'Tomar ticket', () => void ejecutar('tomar', {}, `Tomaste el ticket ${t.folio}.`), true)}
          {a.has('pausar') && botonAccion('pause', 'Pausar', () => setVentana('pausar'))}
          {a.has('reanudar') && botonAccion('play', 'Reanudar', () => void ejecutar('reanudar', { version: t.version }, 'Ticket reanudado.'))}
          {a.has('reasignar') && botonAccion('swap', 'Reasignar', () => setVentana('reasignar'))}
          {a.has('cerrar') && botonAccion('check', 'Cerrar ticket', () => setVentana('cerrar'), true)}
          {a.has('reabrir') && botonAccion('reopen', 'Reabrir', () => void ejecutar('reabrir', { version: t.version }, 'Ticket reabierto.'))}
          {!soporte && <EsperaSolicitante t={t} />}
        </div>
      </div>

      <div className="steps" aria-label="Avance del ticket">
        {['Creado', 'Tomado', 'En proceso', 'Cerrado'].map((nombre, i) => (
          <span key={nombre} style={{ display: 'contents' }}>
            {i > 0 && <span className={`ln ${pasos > i ? 'done' : ''}`} />}
            <span className={`st ${pasos > i ? 'done' : ''}`} aria-current={pasos === i + 1 ? 'step' : undefined}>
              <i>{pasos > i ? <Icono n="check" t="s" /> : i + 1}</i>
              {nombre}
            </span>
          </span>
        ))}
      </div>

      <div className="meta">
        <Celda titulo="Solicitante">
          <Avatar grande />
          {t.solicitante.nombre}
        </Celda>
        <Celda titulo="Asignado a">
          {t.asignado ? (
            <>
              <Avatar grande activo />
              {t.asignado.nombre}
            </>
          ) : (
            <span className="ph">Sin asignar</span>
          )}
        </Celda>
        <Celda titulo="Fecha de creación">{fmtFechaHora(t.creadoAt)}</Celda>
        <Celda titulo="Estatus">
          <PillEstatus estatus={t.estatus} />
        </Celda>
        <Celda titulo="Departamento">{t.departamento.nombre}</Celda>
        <Celda titulo="Empresa">{t.empresa.nombre}</Celda>
        <Celda titulo="Módulo">{t.modulo?.nombre ?? <span className="ph">—</span>}</Celda>
        <Celda titulo="Concepto">{t.concepto ?? <span className="ph">—</span>}</Celda>
        <Celda titulo="Folio(s)">{t.foliosRef ?? <span className="ph">—</span>}</Celda>
      </div>

      <div className="box">
        <h3>Descripción del ticket</h3>
        <div className="rico" dangerouslySetInnerHTML={{ __html: t.descripcionHtml }} />
        {t.creadoPor.id !== t.solicitante.id && <p className="help">Creado por {t.creadoPor.nombre} a nombre del solicitante.</p>}
        <ListaAdjuntos adjuntos={t.adjuntos} />
        <div className="attach">
          {!t.adjuntos.length && (
            <span>
              <Icono n="clip" t="s" />
              Sin archivos adjuntos
            </span>
          )}
          <span>
            <Icono n="mail" t="s" />
            {t.copias.length ? `En copia: ${t.copias.map((c) => c.nombre ?? c.email).join(', ')}` : 'Sin contactos en copia'}
          </span>
        </div>
      </div>

      {soporte && t.estatus === 'PENDIENTE' && !a.has('responder') ? (
        <div className="box">
          <h3>Respuesta</h3>
          <div className="notice gray">
            <Icono n="lock" t="l" />
            <span>Toma el ticket para poder responder o cerrarlo.</span>
          </div>
          {t.mensajes.length > 0 && <Conversacion t={t} />}
        </div>
      ) : (
        <div className="box">
          <h3>Conversación</h3>
          {!soporte && t.estatus !== 'COMPLETADO' && (
            <div className="notice gray">
              <Icono n="mail" t="l" />
              <span>Cuando soporte cierre tu ticket recibirás el aviso en tu correo Outlook. Las respuestas las verás aquí.</span>
            </div>
          )}
          <Conversacion t={t} />
          {!t.mensajes.length && <p className="help">Todavía no hay mensajes.</p>}
          {a.has('comentar') && <Redactar t={t} tipo="comentario" />}
        </div>
      )}

      {a.has('responder') && (
        <div className="box">
          <h3>Responder</h3>
          <Redactar t={t} tipo="respuesta" />
        </div>
      )}

      {soporte && t.asignado && t.asignado.id !== usuario?.id && t.estatus !== 'COMPLETADO' && (
        <div className="notice gray">
          <Icono n="user" t="l" />
          <span>Este ticket lo atiende {t.asignado.nombre}. Solo el técnico asignado puede responder, pausar o cerrarlo.</span>
        </div>
      )}

      {puede(PERMISOS.TICKETS_VER_HISTORIAL) && <Historial id={t.id} />}

      {ventana === 'pausar' && <VentanaPausar t={t} alCerrar={() => setVentana(null)} ejecutar={ejecutar} />}
      {ventana === 'reasignar' && <VentanaReasignar t={t} alCerrar={() => setVentana(null)} ejecutar={ejecutar} />}
      {ventana === 'cerrar' && <VentanaCerrar t={t} alCerrar={() => setVentana(null)} />}
    </div>
  );
}

function Celda({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="cell">
      <small>{titulo}</small>
      <div>{children}</div>
    </div>
  );
}

function EsperaSolicitante({ t }: { t: TicketDetalle }) {
  const textos: Record<string, [NombreIcono, string]> = {
    PENDIENTE: ['clock', 'Esperando que soporte tome tu ticket'],
    EN_PROCESO: ['monitor', `${t.asignado?.nombre ?? 'Soporte'} está atendiendo tu ticket`],
    PAUSADO: ['pause', 'Soporte pausó tu ticket; puede necesitar más información'],
    COMPLETADO: ['check', `Cerrado ${t.cerradoAt ? fmtFechaHora(t.cerradoAt) : ''}`],
  };
  const [icono, texto] = textos[t.estatus] ?? ['clock', ''];
  return (
    <span className="wait">
      <Icono n={icono} />
      {texto}
    </span>
  );
}

function Conversacion({ t }: { t: TicketDetalle }) {
  return (
    <>
      {t.mensajes.map((m) => (
        <div key={m.id} className={`msg ${m.esSoporte ? 'sup' : 'usr'} ${m.tipo === 'RESOLUCION' ? 'res' : ''}`}>
          <header>
            <Avatar activo={m.esSoporte} />
            <b>{m.autor.nombre}</b>
            <span className="ph">· {fmtFechaHora(m.creadoAt)}</span>
            {m.esSoporte && <span className="count">{m.tipo === 'RESOLUCION' ? 'Resolución' : 'Soporte'}</span>}
          </header>
          {m.html && m.html !== '<p></p>' && <div className="rico" dangerouslySetInnerHTML={{ __html: m.html }} />}
          <ListaAdjuntos adjuntos={m.adjuntos} />
        </div>
      ))}
    </>
  );
}

/** Caja para comentar (solicitante) o responder (técnico asignado). */
function Redactar({ t, tipo }: { t: TicketDetalle; tipo: 'comentario' | 'respuesta' }) {
  const avisar = useAvisos();
  const refrescar = useRefrescarTickets();
  const [html, setHtml] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const respuesta = tipo === 'respuesta';

  async function enviar() {
    if (!html && !archivos.length) {
      setError(respuesta ? 'Escribe la respuesta.' : 'Escribe un comentario o adjunta un archivo.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.form(`/tickets/${t.id}/${respuesta ? 'respuestas' : 'comentarios'}`, { html }, archivos);
      setHtml('');
      setArchivos([]);
      avisar(respuesta ? 'Respuesta enviada.' : 'Comentario agregado.');
      refrescar(t.id);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Editor
        id={`redactar-${tipo}-${t.id}`}
        etiqueta={respuesta ? 'Respuesta al solicitante' : 'Agregar un comentario'}
        valor={html}
        alCambiar={setHtml}
        corto
        invalido={!!error}
        placeholder={respuesta ? 'Escribe aquí la respuesta al solicitante…' : 'Agregar información al ticket…'}
      />
      {respuesta && (
        <div className="notice">
          <Icono n="mail" t="l" />
          <span>La respuesta se guarda en el sistema. Al cerrar el ticket, el solicitante recibe el aviso en su correo Outlook.</span>
        </div>
      )}
      {error && <div className="err" role="alert">{error}</div>}
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SelectorArchivos archivos={archivos} alCambiar={setArchivos} compacto />
        </div>
        <button className="btn p" onClick={() => void enviar()} disabled={enviando}>
          <Icono n="send" t="s" />
          {enviando ? 'Enviando…' : respuesta ? 'Responder' : 'Enviar'}
        </button>
      </div>
    </>
  );
}

type Ejecutar = (accion: string, cuerpo: unknown, exito: string) => Promise<boolean>;

function VentanaPausar({ t, alCerrar, ejecutar }: { t: TicketDetalle; alCerrar: () => void; ejecutar: Ejecutar }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal
      titulo={`Pausar ${t.folio}`}
      icono="pause"
      tamano="chica"
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className="btn p"
            disabled={ocupado}
            onClick={async () => {
              if (!motivo.trim()) return setError('Escribe el motivo de la pausa.');
              setOcupado(true);
              if (await ejecutar('pausar', { motivo: motivo.trim(), version: t.version }, 'Ticket pausado.')) alCerrar();
              setOcupado(false);
            }}
          >
            Pausar ticket
          </button>
        </div>
      }
    >
      <div>
        <label className="lbl" htmlFor="motivo-pausa">
          Motivo de la pausa
        </label>
        <textarea id="motivo-pausa" className="inp" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Esperando información del solicitante" aria-invalid={!!error} />
        {error ? <div className="err">{error}</div> : <div className="help">Queda registrado en el historial del ticket.</div>}
      </div>
    </Modal>
  );
}

function VentanaReasignar({ t, alCerrar, ejecutar }: { t: TicketDetalle; alCerrar: () => void; ejecutar: Ejecutar }) {
  const tecnicos = useTecnicos();
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const opciones = (tecnicos.data ?? []).filter((x) => x.id !== t.asignado?.id);
  return (
    <Modal
      titulo={`Reasignar ${t.folio}`}
      icono="swap"
      tamano="chica"
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className="btn p"
            disabled={ocupado || !destino}
            onClick={async () => {
              setOcupado(true);
              if (await ejecutar('reasignar', { asignadoAId: Number(destino), version: t.version }, 'Ticket reasignado.')) alCerrar();
              setOcupado(false);
            }}
          >
            Reasignar
          </button>
        </div>
      }
    >
      {tecnicos.isPending ? (
        <Cargando />
      ) : tecnicos.isError ? (
        <EstadoError error={tecnicos.error} reintentar={() => void tecnicos.refetch()} />
      ) : (
        <div>
          <label className="lbl" htmlFor="reasignar-a">
            Nuevo técnico
          </label>
          <select id="reasignar-a" className="inp" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Selecciona…</option>
            {opciones.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
          <div className="help">Actualmente: {t.asignado?.nombre ?? 'sin asignar'}.</div>
        </div>
      )}
    </Modal>
  );
}

function VentanaCerrar({ t, alCerrar }: { t: TicketDetalle; alCerrar: () => void }) {
  const avisar = useAvisos();
  const refrescar = useRefrescarTickets();
  const [html, setHtml] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cerrar() {
    if (!html) return setError('La resolución es obligatoria para cerrar el ticket.');
    setOcupado(true);
    setError(null);
    try {
      await api.form(`/tickets/${t.id}/cerrar`, { resolucionHtml: html, version: t.version }, archivos);
      avisar(`Ticket ${t.folio} cerrado. Se envió el aviso al solicitante.`);
      refrescar(t.id);
      alCerrar();
    } catch (e) {
      setError(camposDe(e).resolucionHtml ?? mensajeDe(e));
      if (e instanceof ErrorCliente && e.estado === 409) refrescar(t.id);
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={`Cerrar ${t.folio}`}
      icono="check"
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <>
          <div className="n">
            <Icono n="mail" t="l" />
            <span>{t.solicitante.nombre} recibirá la resolución en su correo.</span>
          </div>
          <div className="b">
            <button className="btn" onClick={alCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button className="btn p" onClick={() => void cerrar()} disabled={ocupado}>
              <Icono n="check" t="s" />
              {ocupado ? 'Cerrando…' : 'Cerrar ticket'}
            </button>
          </div>
        </>
      }
    >
      <div>
        <label className="lbl" htmlFor={`resolucion-${t.id}`}>
          Resolución (obligatoria)
        </label>
        <Editor id={`resolucion-${t.id}`} etiqueta="Resolución" valor={html} alCambiar={setHtml} invalido={!!error} placeholder="Describe cómo se resolvió la solicitud…" />
        {error && <div className="err" role="alert">{error}</div>}
      </div>
      <div>
        <span className="lbl">Archivos (opcional)</span>
        <SelectorArchivos archivos={archivos} alCambiar={setArchivos} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Historial
const TEXTO_EVENTO: Record<string, [NombreIcono, (e: EventoInfo) => string]> = {
  CREADO: ['docplus', () => 'creó el ticket'],
  TOMADO: ['check', () => 'tomó el ticket'],
  PAUSADO: ['pause', (e) => `pausó el ticket${e.datos?.motivo ? `: “${String(e.datos.motivo)}”` : ''}`],
  REANUDADO: ['play', () => 'reanudó el ticket'],
  REASIGNADO: ['swap', (e) => `reasignó de ${String(e.datos?.deNombre ?? 'sin asignar')} a ${String(e.datos?.aNombre ?? '—')}`],
  RESPONDIDO: ['send', () => 'respondió'],
  COMENTADO: ['send', () => 'comentó'],
  ADJUNTO_AGREGADO: ['clip', () => 'adjuntó archivos'],
  CERRADO: ['check', () => 'cerró el ticket'],
  REABIERTO: ['reopen', () => 'reabrió el ticket'],
  CORREO_FALLIDO: ['alert', (e) => `no se pudo enviar el correo "${String(e.datos?.asunto ?? '')}"`],
};

function Historial({ id }: { id: number }) {
  const [abierto, setAbierto] = useState(false);
  const q = useHistorial(id, abierto);
  return (
    <div className="box">
      <div className="top">
        <h3>Historial</h3>
        <button className="btn chico" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          <Icono n="history" t="s" />
          {abierto ? 'Ocultar' : 'Ver historial'}
        </button>
      </div>
      {abierto &&
        (q.isPending ? (
          <Cargando />
        ) : q.isError ? (
          <EstadoError error={q.error} reintentar={() => void q.refetch()} />
        ) : (
          <ol className="linea-tiempo">
            {q.data.map((e) => {
              const [icono, texto] = TEXTO_EVENTO[e.tipo] ?? ['clock', () => e.tipo];
              return (
                <li key={e.id}>
                  <span className="punto">
                    <Icono n={icono} />
                  </span>
                  <div>
                    <b>{e.actor?.nombre ?? 'Sistema'}</b> {texto(e)}
                    {e.estatusDespues && e.estatusAntes !== e.estatusDespues && <> → {INFO_ESTATUS[e.estatusDespues]?.nombre}</>}
                    <small>{fmtFechaHora(e.creadoAt)}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        ))}
    </div>
  );
}
