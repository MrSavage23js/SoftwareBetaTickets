// Ventana "Nuevo ticket" de la maqueta: primero el tipo de solicitud; al elegirlo aparece el formulario.
// Al crear muestra la confirmación con el folio y el aviso de correo.
import { useState } from 'react';
import { PERMISOS, type TicketCreado } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../../api/cliente';
import { SelectorArchivos } from '../../componentes/Archivos';
import { SelectorContactos, type Contacto } from '../../componentes/Contactos';
import { Editor } from '../../componentes/Editor';
import { Icono } from '../../componentes/Icono';
import { Cargando, EstadoError, Modal } from '../../componentes/ui';
import { useSesion } from '../../sesion/Sesion';
import { useCatalogos, useRefrescarTickets } from './datos';

export function NuevoTicket({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: number) => void }) {
  const { usuario, puede } = useSesion();
  const cat = useCatalogos();
  const refrescar = useRefrescarTickets();

  const [tipoId, setTipoId] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [moduloId, setModuloId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [foliosRef, setFoliosRef] = useState('');
  const [html, setHtml] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [copias, setCopias] = useState<Contacto[]>([]);
  const [aNombreDe, setANombreDe] = useState<Contacto[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState<TicketCreado | null>(null);

  const empresas = cat.data?.empresas ?? [];
  const tipo = cat.data?.tipos.find((t) => String(t.id) === tipoId);
  // Si el usuario solo tiene una empresa, se preselecciona.
  const empresaEfectiva = empresaId || (empresas.length === 1 ? String(empresas[0]!.id) : '');

  function validarLocal(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!empresaEfectiva) e.empresaId = 'Selecciona la empresa.';
    if (tipo?.requiereModulo && !moduloId) e.moduloId = 'Selecciona el módulo.';
    if (tipo?.requiereConcepto && !concepto.trim()) e.concepto = 'Escribe el concepto.';
    if (tipo?.requiereFolios && !foliosRef.trim()) e.foliosRef = 'Escribe el folio o folios relacionados.';
    if (!html) e.descripcionHtml = 'Escribe la descripción detallada.';
    return e;
  }

  async function crear() {
    const e = validarLocal();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await api.form<TicketCreado>(
        '/tickets',
        {
          tipoId: Number(tipoId),
          empresaId: Number(empresaEfectiva),
          moduloId: moduloId ? Number(moduloId) : null,
          concepto: concepto.trim(),
          foliosRef: foliosRef.trim(),
          descripcionHtml: html,
          copias: copias.map((c) => (c.usuarioId ? { usuarioId: c.usuarioId } : { email: c.email })),
          solicitanteId: aNombreDe[0]?.usuarioId ?? null,
        },
        archivos,
      );
      refrescar();
      setCreado(r);
    } catch (err) {
      const campos = camposDe(err);
      setErrores(campos);
      setErrorGeneral(Object.keys(campos).length ? 'Revisa los campos marcados.' : mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  if (creado) {
    return (
      <Modal
        titulo="Ticket creado"
        icono="check"
        tamano="chica"
        alCerrar={alCerrar}
        pie={
          <div className="b">
            <button className="btn" onClick={alCerrar}>
              Cerrar
            </button>
            <button className="btn p" onClick={() => alCrear(creado.id)}>
              Ver ticket
            </button>
          </div>
        }
      >
        <div className="empty" style={{ padding: '8px 0' }}>
          <span className="ico">
            <Icono n="check" />
          </span>
          <b>Tu folio es</b>
          <span className="folio" style={{ fontSize: 22, color: 'var(--ink-strong)' }}>
            {creado.folio}
          </span>
        </div>
        <div className="notice">
          <Icono n="mail" t="l" />
          <span>
            {creado.correosEncolados > 0
              ? `Enviamos una copia a ${aNombreDe[0]?.email ?? usuario?.email}${copias.length ? ' y a los contactos en copia' : ''}. Si no llega en unos minutos, revisa la carpeta de correo no deseado.`
              : 'El ticket se registró. El aviso por correo no está activo en este momento.'}
          </span>
        </div>
      </Modal>
    );
  }

  const campo = (clave: string) => ({ 'aria-invalid': !!errores[clave] || undefined, 'aria-describedby': errores[clave] ? `nt-${clave}-err` : undefined });
  const error = (clave: string) => errores[clave] && <div className="err" id={`nt-${clave}-err`}>{errores[clave]}</div>;
  const opcional = (requerido?: boolean) => (requerido ? '' : ' (opcional)');

  return (
    <Modal
      titulo="Nuevo ticket de soporte"
      icono="docplus"
      insignia="Mesa de ayuda"
      alCerrar={alCerrar}
      bloqueado={enviando}
      pie={
        <>
          <div className="n">
            <Icono n="mail" t="l" />
            <span>Al crear el ticket recibirás una copia en tu correo Outlook.</span>
          </div>
          <div className="b">
            <button className="btn" onClick={alCerrar} disabled={enviando}>
              Cancelar
            </button>
            {tipo && (
              <button className="btn p" onClick={() => void crear()} disabled={enviando}>
                <Icono n="send" t="s" />
                {enviando ? 'Creando…' : 'Crear ticket'}
              </button>
            )}
          </div>
        </>
      }
    >
      {cat.isPending ? (
        <Cargando />
      ) : cat.isError ? (
        <EstadoError error={cat.error} reintentar={() => void cat.refetch()} />
      ) : (
        <>
          <div>
            <label className="lbl" htmlFor="nt-tipo">
              Tipo de solicitud
            </label>
            <select id="nt-tipo" className="inp" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
              <option value="">— Selecciona un tipo —</option>
              {cat.data.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          {!tipo ? (
            <div className="empty">
              <span className="ico">
                <Icono n="monitor" />
              </span>
              <span>Selecciona un tipo de solicitud para continuar</span>
            </div>
          ) : !empresas.length ? (
            <div className="notice mal">
              <Icono n="alert" t="l" />
              <span>Tu usuario no tiene empresas asignadas. Pide al administrador que te asigne al menos una.</span>
            </div>
          ) : (
            <>
              {errorGeneral && (
                <div className="notice mal" role="alert">
                  <Icono n="alert" t="l" />
                  <span>{errorGeneral}</span>
                </div>
              )}
              {puede(PERMISOS.TICKETS_CREAR_A_NOMBRE_DE) && (
                <div>
                  <label className="lbl" htmlFor="nt-solicitante">
                    A nombre de (opcional)
                  </label>
                  <SelectorContactos id="nt-solicitante" valor={aNombreDe} alCambiar={(c) => setANombreDe(c.filter((x) => x.usuarioId).slice(-1))} />
                  {errores.solicitanteId ? error('solicitanteId') : <div className="help">Déjalo vacío para crearlo a tu nombre.</div>}
                </div>
              )}
              <div className="g2">
                <div>
                  <label className="lbl" htmlFor="nt-emp">
                    Empresa
                  </label>
                  <select id="nt-emp" className="inp" value={empresaEfectiva} onChange={(e) => setEmpresaId(e.target.value)} {...campo('empresaId')}>
                    <option value="">Selecciona…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                  {errores.empresaId ? error('empresaId') : <div className="help">Solo ves las empresas asignadas a tu usuario.</div>}
                </div>
                <div>
                  <label className="lbl" htmlFor="nt-mod">
                    Módulo{opcional(tipo.requiereModulo)}
                  </label>
                  <select id="nt-mod" className="inp" value={moduloId} onChange={(e) => setModuloId(e.target.value)} {...campo('moduloId')}>
                    <option value="">Selecciona…</option>
                    {cat.data.modulos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  {error('moduloId')}
                </div>
                <div>
                  <label className="lbl" htmlFor="nt-con">
                    Concepto{opcional(tipo.requiereConcepto)}
                  </label>
                  <input id="nt-con" className="inp" type="text" maxLength={200} placeholder="Ej. Ajuste de inventario" value={concepto} onChange={(e) => setConcepto(e.target.value)} {...campo('concepto')} />
                  {error('concepto')}
                </div>
                <div>
                  <label className="lbl" htmlFor="nt-fol">
                    Folio(s){opcional(tipo.requiereFolios)}
                  </label>
                  <input id="nt-fol" className="inp" type="text" maxLength={500} placeholder="Ej. 1024, 1025" value={foliosRef} onChange={(e) => setFoliosRef(e.target.value)} {...campo('foliosRef')} />
                  {error('foliosRef')}
                </div>
              </div>

              <div className="rule">{tipo.tituloDetalle}</div>

              <div>
                <label className="lbl" htmlFor="nt-desc">
                  Descripción detallada
                </label>
                <Editor id="nt-desc" etiqueta="Descripción detallada" valor={html} alCambiar={setHtml} invalido={!!errores.descripcionHtml} placeholder="Escribe aquí la descripción detallada…" />
                {error('descripcionHtml')}
              </div>

              <div>
                <span className="lbl">Archivo adjunto</span>
                <SelectorArchivos archivos={archivos} alCambiar={setArchivos} />
              </div>

              <div>
                <label className="lbl" htmlFor="nt-cc">
                  Enviar copia a
                </label>
                <SelectorContactos id="nt-cc" valor={copias} alCambiar={setCopias} />
                {errores.copias ? error('copias') : <div className="help">Puedes seleccionar uno o varios contactos, o escribir un correo.</div>}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
