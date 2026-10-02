import { useState, type FormEvent } from 'react';
import type { RespuestaSesion } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Modal, useAvisos } from '../componentes/ui';
import { useSesion } from '../sesion/Sesion';

function useFormulario(alTerminar: () => void) {
  const { actualizar } = useSesion();
  const avisar = useAvisos();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    const loc: Record<string, string> = {};
    if (!actual) loc.actual = 'Escribe tu contraseña actual.';
    if (!nueva) loc.nueva = 'Escribe la contraseña nueva.';
    if (nueva && nueva !== confirmar) loc.confirmar = 'Las contraseñas no coinciden.';
    setErrores(loc);
    setGeneral(null);
    if (Object.keys(loc).length) return;
    setEnviando(true);
    try {
      actualizar(await api.post<RespuestaSesion>('/auth/cambiar-password', { actual, nueva, confirmar }));
      avisar('Contraseña actualizada. Se cerraron tus sesiones en otros equipos.');
      alTerminar();
    } catch (err) {
      const c = camposDe(err);
      setErrores(c);
      setGeneral(Object.keys(c).length ? null : mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  const campos = (
    <>
      {general && (
        <div className="notice mal" role="alert">
          <Icono n="alert" t="l" />
          <span>{general}</span>
        </div>
      )}
      {(
        [
          ['actual', 'Contraseña actual', actual, setActual, 'current-password'],
          ['nueva', 'Contraseña nueva', nueva, setNueva, 'new-password'],
          ['confirmar', 'Confirmar contraseña nueva', confirmar, setConfirmar, 'new-password'],
        ] as const
      ).map(([clave, etiqueta, valor, fijar, auto]) => (
        <div key={clave}>
          <label className="lbl" htmlFor={`cp-${clave}`}>
            {etiqueta}
          </label>
          <input id={`cp-${clave}`} className="inp" type="password" autoComplete={auto} value={valor} onChange={(e) => fijar(e.target.value)} aria-invalid={!!errores[clave]} />
          {errores[clave] ? <div className="err">{errores[clave]}</div> : clave === 'nueva' && <div className="help">Mínimo 8 caracteres, con letras y números.</div>}
        </div>
      ))}
    </>
  );
  return { campos, enviar, enviando };
}

/** Pantalla obligatoria: el admin asignó la contraseña y hay que cambiarla antes de usar el sistema. */
export function CambioObligatorio() {
  const { usuario, salir } = useSesion();
  const f = useFormulario(() => undefined);
  return (
    <div className="login">
      <div className="brandside">
        <div className="logo">
          <span className="mark">
            <Icono n="vela" t="l" />
          </span>
          Sistema de Tickets
        </div>
        <div>
          <h2>Protege tu cuenta</h2>
          <p className="lede">Tu contraseña la asignó el administrador. Elige una nueva que solo tú conozcas para continuar.</p>
        </div>
        <div className="pie-marca">Grupo Aramo</div>
      </div>
      <div className="formside">
        <form onSubmit={(e) => void f.enviar(e)} noValidate>
          <div>
            <h1>Cambia tu contraseña</h1>
            <p>Hola {usuario?.nombre}. Es necesario antes de entrar al sistema.</p>
          </div>
          {f.campos}
          <button className="btn p" type="submit" disabled={f.enviando} style={{ width: '100%' }}>
            {f.enviando ? 'Guardando…' : 'Cambiar contraseña y entrar'}
          </button>
          <button type="button" className="btn" onClick={() => void salir()}>
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}

/** Ventana para cambiar la contraseña cuando el usuario quiera. */
export function VentanaCambiarPassword({ alCerrar }: { alCerrar: () => void }) {
  const f = useFormulario(alCerrar);
  return (
    <Modal
      titulo="Cambiar contraseña"
      icono="lock"
      tamano="chica"
      alCerrar={alCerrar}
      bloqueado={f.enviando}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={f.enviando}>
            Cancelar
          </button>
          <button className="btn p" onClick={() => void f.enviar()} disabled={f.enviando}>
            {f.enviando ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      }
    >
      {f.campos}
    </Modal>
  );
}
