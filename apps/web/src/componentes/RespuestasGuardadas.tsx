// Respuestas guardadas de cada técnico: textos que escribe una vez y luego inserta con un clic al
// responder o cerrar un ticket. Una sola ventana para elegir, crear, editar y borrar (solo las suyas).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RespuestaGuardada } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Editor } from './Editor';
import { Icono } from './Icono';
import { Cargando, EstadoError, EstadoVacio, Modal, useAvisos } from './ui';

const CLAVE = ['respuestas-guardadas'] as const;

/** Texto plano de un HTML para la vista previa de cada respuesta. */
function textoDe(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html.replace(/<\/(p|li)>/gi, '$& ');
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface Edicion {
  id: number | null;
  titulo: string;
  html: string;
}

export function VentanaRespuestas({
  insertar,
  textoActual,
  alCerrar,
}: {
  insertar: (html: string) => void;
  textoActual: string;
  alCerrar: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => api.get<RespuestaGuardada[]>('/respuestas', undefined, signal),
  });
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    if (!edicion) return;
    setOcupado(true);
    setErrores({});
    try {
      const cuerpo = { titulo: edicion.titulo, cuerpoHtml: edicion.html };
      const lista =
        edicion.id === null
          ? await api.post<RespuestaGuardada[]>('/respuestas', cuerpo)
          : await api.put<RespuestaGuardada[]>(`/respuestas/${edicion.id}`, cuerpo);
      qc.setQueryData(CLAVE, lista);
      avisar(edicion.id === null ? 'Respuesta guardada.' : 'Respuesta actualizada.');
      setEdicion(null);
    } catch (e) {
      const campos = camposDe(e);
      setErrores(Object.keys(campos).length ? campos : { general: mensajeDe(e) });
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (id: number) => {
    setOcupado(true);
    try {
      qc.setQueryData(CLAVE, await api.delete<RespuestaGuardada[]>(`/respuestas/${id}`));
      avisar('Respuesta borrada.');
    } catch (e) {
      avisar(mensajeDe(e), 'mal');
    } finally {
      setBorrando(null);
      setOcupado(false);
    }
  };

  const editar = (e: Edicion) => {
    setErrores({});
    setEdicion(e);
  };

  if (edicion) {
    return (
      <Modal
        titulo={edicion.id === null ? 'Nueva respuesta guardada' : 'Editar respuesta guardada'}
        icono="edit"
        tamano="grande"
        alCerrar={alCerrar}
        bloqueado={ocupado}
        pie={
          <div className="b">
            <button className="btn" onClick={() => setEdicion(null)} disabled={ocupado}>
              Volver
            </button>
            <button className="btn p" onClick={() => void guardar()} disabled={ocupado}>
              <Icono n="check" t="s" />
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div>
          <label className="lbl" htmlFor="resp-titulo">
            Título
          </label>
          <input
            id="resp-titulo"
            className="inp"
            maxLength={80}
            placeholder="Ej. Reinicio del equipo"
            value={edicion.titulo}
            autoFocus
            onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })}
            aria-invalid={!!errores.titulo}
          />
          {errores.titulo ? (
            <div className="err">{errores.titulo}</div>
          ) : (
            <div className="help">Solo tú lo ves; sirve para encontrarla rápido.</div>
          )}
        </div>
        <div>
          <span className="lbl">Texto</span>
          <Editor
            id="resp-texto"
            etiqueta="Texto de la respuesta"
            valor={edicion.html}
            alCambiar={(html) => setEdicion((e) => (e ? { ...e, html } : e))}
            invalido={!!errores.cuerpoHtml}
            imagenes={false}
            placeholder="Escribe la respuesta tal como quieres insertarla…"
          />
          {errores.cuerpoHtml && <div className="err">{errores.cuerpoHtml}</div>}
        </div>
        {errores.general && (
          <div className="err" role="alert">
            {errores.general}
          </div>
        )}
      </Modal>
    );
  }

  const todas = q.data ?? [];
  const filtro = busqueda.trim().toLowerCase();
  const visibles = filtro
    ? todas.filter((r) => `${r.titulo} ${textoDe(r.cuerpoHtml)}`.toLowerCase().includes(filtro))
    : todas;

  return (
    <Modal
      titulo="Respuestas guardadas"
      icono="respuestas"
      tamano="grande"
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <>
          <div className="n">
            {textoActual && (
              <button className="btn" onClick={() => editar({ id: null, titulo: '', html: textoActual })}>
                <Icono n="docplus" t="s" />
                Guardar lo que escribí
              </button>
            )}
          </div>
          <div className="b">
            <button className="btn p" onClick={() => editar({ id: null, titulo: '', html: '' })}>
              <Icono n="plus" t="s" />
              Nueva respuesta
            </button>
          </div>
        </>
      }
    >
      {q.isPending ? (
        <Cargando />
      ) : q.isError ? (
        <EstadoError error={q.error} reintentar={() => void q.refetch()} />
      ) : !todas.length ? (
        <EstadoVacio
          icono="respuestas"
          titulo="Aún no tienes respuestas guardadas"
          texto="Guarda los textos que escribes seguido y aquí los insertas con un clic. Solo tú los ves."
        />
      ) : (
        <>
          {todas.length > 5 && (
            <input
              className="inp"
              type="search"
              placeholder="Buscar respuesta…"
              aria-label="Buscar respuesta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          )}
          {!visibles.length && <EstadoVacio icono="search" titulo="Sin coincidencias" />}
          <ul className="resp-lista">
            {visibles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="resp-usar"
                  title="Insertar en el texto"
                  onClick={() => {
                    insertar(r.cuerpoHtml);
                    alCerrar();
                  }}
                >
                  <b>{r.titulo}</b>
                  <span>{textoDe(r.cuerpoHtml)}</span>
                </button>
                {borrando === r.id ? (
                  <span className="resp-acciones">
                    <span className="help">¿Borrar?</span>
                    <button
                      type="button"
                      className="btn chico peligro"
                      disabled={ocupado}
                      onClick={() => void borrar(r.id)}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      className="btn chico"
                      disabled={ocupado}
                      onClick={() => setBorrando(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <span className="resp-acciones">
                    <button
                      type="button"
                      className="icon-btn chico"
                      aria-label={`Editar "${r.titulo}"`}
                      title="Editar"
                      onClick={() => editar({ id: r.id, titulo: r.titulo, html: r.cuerpoHtml })}
                    >
                      <Icono n="edit" t="s" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn chico"
                      aria-label={`Borrar "${r.titulo}"`}
                      title="Borrar"
                      onClick={() => setBorrando(r.id)}
                    >
                      <Icono n="trash" t="s" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Botón para la barra del editor: abre la ventana e inserta la respuesta elegida donde está el cursor. */
export function BotonRespuestas({
  insertar,
  textoActual,
}: {
  insertar: (html: string) => void;
  textoActual: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tb-resp"
        title="Insertar una de tus respuestas guardadas"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAbierta(true)}
      >
        <Icono n="respuestas" t="s" />
        Respuestas
      </button>
      {/* Fuera de la barra del editor: si no, sus estilos de botón (.rte .tb button) alcanzarían a la ventana. */}
      {abierta &&
        createPortal(
          <VentanaRespuestas
            insertar={insertar}
            textoActual={textoActual}
            alCerrar={() => setAbierta(false)}
          />,
          document.body,
        )}
    </>
  );
}
