// Catálogos administrables: empresas, tipos de solicitud y módulos. Nada se borra: se desactiva
// (los tickets viejos siguen mostrando su empresa/tipo/módulo aunque ya no aparezca en "Nuevo ticket").
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Catalogos as DatosCatalogos, DepartamentoFila, EmpresaFila, ModuloFila, TipoSolicitudFila } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Cargando, EstadoError, Modal, useAvisos } from '../componentes/ui';

type Pestana = 'departamentos' | 'empresas' | 'tipos' | 'modulos';
type Fila = DepartamentoFila | EmpresaFila | TipoSolicitudFila | ModuloFila;

const TITULOS: Record<Pestana, { plural: string; singular: string; ayuda: string }> = {
  departamentos: { plural: 'Departamentos', singular: 'departamento', ayuda: 'El código (2 a 6 letras) forma el folio: SIS → SIS-2026-0001. El consecutivo se reinicia cada 1 de enero.' },
  empresas: { plural: 'Empresas', singular: 'empresa', ayuda: 'El usuario solo puede crear tickets de sus empresas asignadas. El código es corto, para reportes.' },
  tipos: { plural: 'Tipos de solicitud', singular: 'tipo de solicitud', ayuda: 'El título es el encabezado de la sección en "Nuevo ticket". El código es corto, para reportes.' },
  modulos: { plural: 'Módulos', singular: 'módulo', ayuda: 'El código es opcional (para reportes).' },
};

export function Catalogos() {
  const [pestana, setPestana] = useState<Pestana>('departamentos');
  const [editando, setEditando] = useState<Fila | 'nuevo' | null>(null);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const q = useQuery({ queryKey: ['catalogos', 'admin'], queryFn: ({ signal }) => api.get<DatosCatalogos>('/catalogos', { admin: 1 }, signal) });

  const refrescar = () => void qc.invalidateQueries({ queryKey: ['catalogos'] });
  const filas: Fila[] = q.data ? q.data[pestana] : [];
  const t = TITULOS[pestana];

  async function alternar(f: Fila) {
    const activo = 'activa' in f ? f.activa : f.activo;
    try {
      await api.put(`/catalogos/${pestana}/${f.id}`, aCuerpo(pestana, f, { activo: !activo }));
      refrescar();
      avisar(`${f.nombre} ${activo ? 'desactivado' : 'activado'}.`);
    } catch (e) {
      avisar(mensajeDe(e), 'mal');
    }
  }

  return (
    <>
      <header className="head">
        <div>
          <h1>Catálogos</h1>
          <p>Empresas, tipos de solicitud y módulos que aparecen al crear un ticket</p>
        </div>
        <div className="tools">
          <button className="btn p" onClick={() => setEditando('nuevo')}>
            <Icono n="plus" />
            Agregar {t.singular}
          </button>
        </div>
      </header>
      <div className="bar">
        <div className="seg" role="tablist" aria-label="Catálogo">
          {(Object.keys(TITULOS) as Pestana[]).map((p) => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}>
              {TITULOS[p].plural}
            </button>
          ))}
        </div>
      </div>
      <div className="pagina">
        <section className="panel">
          <div className="panel-h">
            <h2>{t.plural}</h2>
            <span className="help" style={{ margin: 0 }}>{t.ayuda}</span>
          </div>
          {q.isPending ? (
            <Cargando />
          ) : q.isError ? (
            <EstadoError error={q.error} reintentar={() => void q.refetch()} />
          ) : (
            <div className="tabla-caja">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Nombre</th>
                    <th>Código</th>
                    {pestana === 'tipos' && <th>Título de la sección</th>}
                    {pestana === 'tipos' && <th>Campos obligatorios</th>}
                    {(pestana === 'empresas' || pestana === 'departamentos') && <th>Usuarios</th>}
                    <th>Tickets</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const activo = 'activa' in f ? f.activa : f.activo;
                    return (
                      <tr key={f.id} className={activo ? '' : 'inactivo'}>
                        <td className="ph">{f.orden}</td>
                        <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                        <td className="folio">{f.codigo ?? '—'}</td>
                        {'tituloDetalle' in f && <td className="ph">{f.tituloDetalle}</td>}
                        {'tituloDetalle' in f && (
                          <td className="ph">{[f.requiereModulo && 'Módulo', f.requiereConcepto && 'Concepto', f.requiereFolios && 'Folio(s)'].filter(Boolean).join(', ') || 'Solo descripción'}</td>
                        )}
                        {(pestana === 'empresas' || pestana === 'departamentos') && <td className="ph">{(f as EmpresaFila | DepartamentoFila).usuarios ?? 0}</td>}
                        <td className="ph">{(f.tickets ?? 0).toLocaleString('es-MX')}</td>
                        <td>{activo ? <span className="pill on">Activo</span> : <span className="pill off">Inactivo</span>}</td>
                        <td className="acc">
                          <button className="icon-btn chico" aria-label={`Editar ${f.nombre}`} title="Editar" onClick={() => setEditando(f)}>
                            <Icono n="edit" t="s" />
                          </button>
                          <button className="btn chico" onClick={() => void alternar(f)}>
                            {activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {editando && (
        <FormCatalogo
          pestana={pestana}
          fila={editando === 'nuevo' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={(advertencia) => {
            setEditando(null);
            refrescar();
            avisar('Cambios guardados.');
            if (advertencia) avisar(advertencia);
          }}
        />
      )}
    </>
  );
}

function aCuerpo(p: Pestana, f: Partial<Fila>, cambios: { activo?: boolean } = {}) {
  const activo = cambios.activo ?? ('activa' in f ? f.activa : (f as { activo?: boolean }).activo) ?? true;
  const base = { nombre: f.nombre, codigo: f.codigo ?? '', orden: f.orden ?? 0 };
  if (p === 'empresas') return { ...base, activa: activo };
  if (p === 'tipos') {
    const t = f as Partial<TipoSolicitudFila>;
    return { ...base, activo, tituloDetalle: t.tituloDetalle, requiereModulo: t.requiereModulo, requiereConcepto: t.requiereConcepto, requiereFolios: t.requiereFolios };
  }
  return { ...base, activo };
}

function FormCatalogo({ pestana, fila, alCerrar, alGuardar }: { pestana: Pestana; fila: Fila | null; alCerrar: () => void; alGuardar: (advertencia: string | null) => void }) {
  const tipo = fila && 'tituloDetalle' in fila ? fila : null;
  const [v, setV] = useState({
    nombre: fila?.nombre ?? '',
    codigo: fila?.codigo ?? '',
    orden: fila?.orden ?? 0,
    tituloDetalle: tipo?.tituloDetalle ?? '',
    requiereModulo: tipo?.requiereModulo ?? true,
    requiereConcepto: tipo?.requiereConcepto ?? true,
    requiereFolios: tipo?.requiereFolios ?? true,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const t = TITULOS[pestana];
  const activo = fila ? ('activa' in fila ? fila.activa : fila.activo) : true;

  async function guardar() {
    setGuardando(true);
    setGeneral(null);
    const cuerpo = aCuerpo(pestana, { ...v, codigo: v.codigo.toUpperCase() } as never, { activo });
    try {
      const r = fila ? await api.put<{ advertencia: string | null }>(`/catalogos/${pestana}/${fila.id}`, cuerpo) : await api.post<{ advertencia: string | null }>(`/catalogos/${pestana}`, cuerpo);
      alGuardar(r.advertencia);
    } catch (e) {
      const campos = camposDe(e);
      setErrores(campos);
      setGeneral(Object.keys(campos).length ? 'Revisa los campos marcados.' : mensajeDe(e));
      setGuardando(false);
    }
  }

  const err = (k: string) => errores[k] && <div className="err">{errores[k]}</div>;
  return (
    <Modal
      titulo={fila ? `Editar ${fila.nombre}` : `Agregar ${t.singular}`}
      icono="catalog"
      tamano="chica"
      alCerrar={alCerrar}
      bloqueado={guardando}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn p" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      }
    >
      {general && <div className="notice mal">{general}</div>}
      <div>
        <label className="lbl" htmlFor="c-nombre">Nombre</label>
        <input id="c-nombre" className="inp" value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} aria-invalid={!!errores.nombre} />
        {err('nombre')}
      </div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="c-codigo">Código{pestana === 'modulos' ? ' (opcional)' : ''}</label>
          <input id="c-codigo" className="inp folio" maxLength={pestana === 'modulos' || pestana === 'departamentos' ? 6 : 4} value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} aria-invalid={!!errores.codigo} />
          {err('codigo')}
        </div>
        <div>
          <label className="lbl" htmlFor="c-orden">Orden</label>
          <input id="c-orden" className="inp" type="number" min={0} max={9999} value={v.orden} onChange={(e) => setV({ ...v, orden: Number(e.target.value) })} />
        </div>
      </div>
      {pestana === 'tipos' && (
        <>
          <div>
            <label className="lbl" htmlFor="c-titulo">Título de la sección</label>
            <input id="c-titulo" className="inp" placeholder="Ej. Detalle de la corrección" value={v.tituloDetalle} onChange={(e) => setV({ ...v, tituloDetalle: e.target.value })} aria-invalid={!!errores.tituloDetalle} />
            {err('tituloDetalle')}
          </div>
          <div role="group" aria-label="Campos obligatorios">
            <span className="lbl">Campos obligatorios al crear el ticket</span>
            <label className="check"><input type="checkbox" checked={v.requiereModulo} onChange={(e) => setV({ ...v, requiereModulo: e.target.checked })} />Módulo</label>
            <label className="check"><input type="checkbox" checked={v.requiereConcepto} onChange={(e) => setV({ ...v, requiereConcepto: e.target.checked })} />Concepto</label>
            <label className="check"><input type="checkbox" checked={v.requiereFolios} onChange={(e) => setV({ ...v, requiereFolios: e.target.checked })} />Folio(s)</label>
          </div>
        </>
      )}
      {fila && pestana === 'departamentos' && (
        <div className="notice gray">
          <Icono n="alert" t="l" />
          <span>Si cambias el código, los folios ya emitidos no cambian; los tickets nuevos usarán el código nuevo y empezarán en 0001.</span>
        </div>
      )}
    </Modal>
  );
}
