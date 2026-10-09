// Anuncios: los admins mandan un aviso que aparece como banner arriba de la pantalla, para todos o
// para ciertos departamentos. Se ve en cuanto se manda y hasta que se retira (no hay programación).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOMBRE_TIPO_ANUNCIO, TIPOS_ANUNCIO, type AnuncioAdmin, type TipoAnuncio } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Cargando, Confirmar, EstadoError, EstadoVacio, Modal, useAvisos } from '../componentes/ui';
import { fmtFechaHora } from '../lib/formato';
import { useCatalogos } from './tickets/datos';

const CLAVE = ['anuncios', 'admin'] as const;
const AYUDA_TIPO: Record<TipoAnuncio, string> = {
  INFO: 'Azul. Cada quien lo puede cerrar.',
  ADVERTENCIA: 'Amarillo. Cada quien lo puede cerrar.',
  URGENTE: 'Rojo. No se puede cerrar: se quita cuando lo retiras.',
};
const PILL: Record<TipoAnuncio, string> = { INFO: 'proc', ADVERTENCIA: 'pend', URGENTE: 'mal' };

export function Anuncios() {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nuevo, setNuevo] = useState(false);
  const [confirmar, setConfirmar] = useState<{ anuncio: AnuncioAdmin; accion: 'retirar' | 'borrar' } | null>(null);
  const q = useQuery({ queryKey: CLAVE, queryFn: ({ signal }) => api.get<AnuncioAdmin[]>('/anuncios', undefined, signal) });

  // La lista de admin viene en la respuesta; el banner propio se vuelve a consultar.
  const actualizar = (lista: AnuncioAdmin[]) => {
    qc.setQueryData(CLAVE, lista);
    void qc.invalidateQueries({ queryKey: ['anuncios', 'mios'] });
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Anuncios</h1>
          <p>Avisos que aparecen arriba de la pantalla en cuanto los mandas</p>
        </div>
        <div className="tools">
          <button className="btn p" onClick={() => setNuevo(true)}>
            <Icono n="megafono" />
            Mandar anuncio
          </button>
        </div>
      </header>
      <div className="pagina" style={{ paddingTop: 20 }}>
        <section className="panel">
          {q.isPending ? (
            <Cargando />
          ) : q.isError ? (
            <EstadoError error={q.error} reintentar={() => void q.refetch()} />
          ) : !q.data.length ? (
            <EstadoVacio icono="megafono" titulo="No has mandado anuncios" texto="Un anuncio sale como banner arriba de la pantalla, para todos o para los departamentos que elijas." />
          ) : (
            <div className="tabla-caja">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Anuncio</th>
                    <th>Tipo</th>
                    <th>Para</th>
                    <th>Mandado</th>
                    <th>Lo cerraron</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((a) => (
                    <tr key={a.id} className={a.activo ? '' : 'inactivo'}>
                      <td style={{ maxWidth: 420 }}>
                        <div style={{ fontWeight: 600 }}>{a.titulo}</div>
                        <div className="ph" style={{ whiteSpace: 'pre-line' }}>{a.mensaje}</div>
                      </td>
                      <td><span className={`pill ${PILL[a.tipo]}`}>{NOMBRE_TIPO_ANUNCIO[a.tipo]}</span></td>
                      <td className="ph">{a.departamentos.length ? a.departamentos.map((d) => d.nombre).join(', ') : 'Todos'}</td>
                      <td className="ph">
                        {fmtFechaHora(a.creadoAt)}
                        {a.autor && <div>por {a.autor}</div>}
                      </td>
                      <td className="ph">{a.cerrable ? `${a.cerrados.toLocaleString('es-MX')} ${a.cerrados === 1 ? 'persona' : 'personas'}` : '—'}</td>
                      <td>
                        {a.activo ? (
                          <span className="pill on">Visible</span>
                        ) : (
                          <span className="pill off" title={a.retiradoAt ? `Retirado el ${fmtFechaHora(a.retiradoAt)}` : undefined}>Retirado</span>
                        )}
                      </td>
                      <td className="acc">
                        {a.activo && (
                          <button className="btn chico" onClick={() => setConfirmar({ anuncio: a, accion: 'retirar' })}>
                            Retirar
                          </button>
                        )}
                        <button className="icon-btn chico" aria-label={`Borrar ${a.titulo}`} title="Borrar" onClick={() => setConfirmar({ anuncio: a, accion: 'borrar' })}>
                          <Icono n="trash" t="s" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {nuevo && (
        <FormAnuncio
          alCerrar={() => setNuevo(false)}
          alMandar={(lista) => {
            setNuevo(false);
            actualizar(lista);
            avisar('Anuncio mandado. Ya aparece arriba de la pantalla.');
          }}
        />
      )}
      {confirmar && (
        <Confirmar
          titulo={confirmar.accion === 'retirar' ? 'Retirar anuncio' : 'Borrar anuncio'}
          texto={
            confirmar.accion === 'retirar'
              ? `"${confirmar.anuncio.titulo}" dejará de verse para todos. Queda en esta lista como retirado.`
              : `"${confirmar.anuncio.titulo}" se borra por completo${confirmar.anuncio.activo ? ' y deja de verse para todos' : ''}.`
          }
          confirmar={confirmar.accion === 'retirar' ? 'Retirar' : 'Borrar'}
          peligro={confirmar.accion === 'borrar'}
          alCerrar={() => setConfirmar(null)}
          alConfirmar={async () => {
            const { anuncio, accion } = confirmar;
            const lista =
              accion === 'retirar' ? await api.post<AnuncioAdmin[]>(`/anuncios/${anuncio.id}/retirar`) : await api.delete<AnuncioAdmin[]>(`/anuncios/${anuncio.id}`);
            actualizar(lista);
            avisar(accion === 'retirar' ? 'Anuncio retirado.' : 'Anuncio borrado.');
          }}
        />
      )}
    </>
  );
}

function FormAnuncio({ alCerrar, alMandar }: { alCerrar: () => void; alMandar: (lista: AnuncioAdmin[]) => void }) {
  const cat = useCatalogos();
  const [v, setV] = useState({ titulo: '', mensaje: '', tipo: 'INFO' as TipoAnuncio });
  const [paraTodos, setParaTodos] = useState(true);
  const [departamentos, setDepartamentos] = useState<number[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const deps = (cat.data?.departamentos ?? []).filter((d) => d.activo);

  async function mandar() {
    if (!paraTodos && !departamentos.length) {
      setErrores({ departamentoIds: 'Elige al menos un departamento.' });
      setGeneral('Revisa los campos marcados.');
      return;
    }
    setMandando(true);
    setGeneral(null);
    try {
      alMandar(await api.post<AnuncioAdmin[]>('/anuncios', { ...v, departamentoIds: paraTodos ? [] : departamentos }));
    } catch (e) {
      const campos = camposDe(e);
      setErrores(campos);
      setGeneral(Object.keys(campos).length ? 'Revisa los campos marcados.' : mensajeDe(e));
      setMandando(false);
    }
  }

  const err = (k: string) => errores[k] && <div className="err">{errores[k]}</div>;
  const alternar = (id: number) => setDepartamentos((ds) => (ds.includes(id) ? ds.filter((d) => d !== id) : [...ds, id]));

  return (
    <Modal
      titulo="Mandar anuncio"
      icono="megafono"
      alCerrar={alCerrar}
      bloqueado={mandando}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={mandando}>
            Cancelar
          </button>
          <button className="btn p" onClick={() => void mandar()} disabled={mandando}>
            {mandando ? 'Mandando…' : 'Mandar ahora'}
          </button>
        </div>
      }
    >
      {general && <div className="notice mal">{general}</div>}
      <div>
        <label className="lbl" htmlFor="an-titulo">Título</label>
        <input id="an-titulo" className="inp" maxLength={100} placeholder="Ej. Mantenimiento del servidor" value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} aria-invalid={!!errores.titulo} />
        {err('titulo')}
      </div>
      <div>
        <label className="lbl" htmlFor="an-mensaje">Mensaje</label>
        <textarea id="an-mensaje" className="inp" rows={3} maxLength={500} placeholder="Ej. El sábado de 8 a 12 no estará disponible el sistema." value={v.mensaje} onChange={(e) => setV({ ...v, mensaje: e.target.value })} aria-invalid={!!errores.mensaje} />
        {errores.mensaje ? err('mensaje') : <div className="help">{v.mensaje.length}/500</div>}
      </div>
      <div role="radiogroup" aria-label="Tipo">
        <span className="lbl">Tipo</span>
        {TIPOS_ANUNCIO.map((t) => (
          <label className="check" key={t}>
            <input type="radio" name="an-tipo" checked={v.tipo === t} onChange={() => setV({ ...v, tipo: t })} />
            <span>
              <span className={`pill ${PILL[t]}`}>{NOMBRE_TIPO_ANUNCIO[t]}</span> <span className="ph">{AYUDA_TIPO[t]}</span>
            </span>
          </label>
        ))}
      </div>
      <div role="group" aria-label="Para quién">
        <span className="lbl">Para quién</span>
        <label className="check">
          <input type="radio" name="an-para" checked={paraTodos} onChange={() => setParaTodos(true)} />
          Todos los usuarios
        </label>
        <label className="check">
          <input type="radio" name="an-para" checked={!paraTodos} onChange={() => setParaTodos(false)} />
          Solo ciertos departamentos
        </label>
        {!paraTodos && (
          <div style={{ paddingLeft: 28 }}>
            {cat.isPending ? (
              <div className="help">Cargando departamentos…</div>
            ) : (
              deps.map((d) => (
                <label className="check" key={d.id}>
                  <input type="checkbox" checked={departamentos.includes(d.id)} onChange={() => alternar(d.id)} />
                  {d.nombre}
                </label>
              ))
            )}
            {err('departamentoIds')}
            <div className="help">Quien no tiene departamento asignado solo ve los anuncios para todos.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
