// Piezas de interfaz reutilizables: estados de carga/vacío/error, ventanas, confirmaciones y avisos.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { INFO_ESTATUS, type Estatus } from '@mesa/shared';
import { mensajeDe } from '../api/cliente';
import { Icono, type NombreIcono } from './Icono';

// ---------------------------------------------------------------- Estados
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="giro" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Esqueletos({ n = 3 }: { n?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="esqueleto" />
      ))}
    </div>
  );
}

export function EstadoVacio({ icono = 'ticket', titulo, texto, children }: { icono?: NombreIcono; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="ico">
        <Icono n={icono} />
      </span>
      <b>{titulo}</b>
      {texto && <span>{texto}</span>}
      {children}
    </div>
  );
}

export function EstadoError({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  return (
    <div className="empty mal" role="alert">
      <span className="ico">
        <Icono n="alert" />
      </span>
      <b>No se pudo cargar la información</b>
      <span>{mensajeDe(error)}</span>
      {reintentar && (
        <button className="btn" onClick={reintentar}>
          <Icono n="refresh" t="s" />
          Reintentar
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Pequeños
export function PillEstatus({ estatus }: { estatus: Estatus }) {
  const i = INFO_ESTATUS[estatus];
  return <span className={`pill ${i?.clase ?? 'pend'}`}>{i?.nombre ?? estatus}</span>;
}

export function Avatar({ activo, grande }: { activo?: boolean; grande?: boolean }) {
  return (
    <span className={['avatar', grande && 'big', activo && 'on'].filter(Boolean).join(' ')} aria-hidden="true">
      <Icono n="user" />
    </span>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  id,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div>
      <label className="lbl" htmlFor={id}>
        {etiqueta}
      </label>
      {children}
      {error ? (
        <div className="err" id={`${id}-err`} role="alert">
          {error}
        </div>
      ) : (
        ayuda && <div className="help">{ayuda}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Ventana
export function Modal({
  titulo,
  icono,
  insignia,
  tamano,
  alCerrar,
  pie,
  children,
  bloqueado,
}: {
  titulo: string;
  icono?: NombreIcono;
  insignia?: string;
  tamano?: 'chica' | 'grande';
  alCerrar: () => void;
  pie?: ReactNode;
  children: ReactNode;
  /** Mientras se guarda no se puede cerrar (evita perder el resultado). */
  bloqueado?: boolean;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const anterior = useRef<Element | null>(null);

  useEffect(() => {
    anterior.current = document.activeElement;
    const primero = caja.current?.querySelector<HTMLElement>('input, select, textarea, [contenteditable], button:not([data-cerrar])');
    primero?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueado) alCerrar();
    };
    document.addEventListener('keydown', tecla);
    const desbordamiento = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = desbordamiento;
      (anterior.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloqueado) alCerrar();
      }}
    >
      <div className={['modal', tamano].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={id} ref={caja}>
        <div className="modal-h">
          <div className="t">
            {icono && (
              <span className="ico">
                <Icono n={icono} t="l" />
              </span>
            )}
            <h2 id={id}>{titulo}</h2>
            {insignia && <span className="badge">{insignia}</span>}
          </div>
          <button className="icon-btn" style={{ border: 0, background: 'transparent' }} aria-label="Cerrar" onClick={alCerrar} disabled={bloqueado} data-cerrar>
            <Icono n="x" t="l" />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {pie && <div className="modal-f">{pie}</div>}
      </div>
    </div>
  );
}

/** Confirmación dentro de la página (el prompt pide confirmar antes de eliminar). */
export function Confirmar({
  titulo,
  texto,
  confirmar = 'Confirmar',
  peligro,
  alConfirmar,
  alCerrar,
}: {
  titulo: string;
  texto: ReactNode;
  confirmar?: string;
  peligro?: boolean;
  alConfirmar: () => Promise<unknown>;
  alCerrar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      titulo={titulo}
      icono={peligro ? 'alert' : 'check'}
      tamano="chica"
      alCerrar={alCerrar}
      bloqueado={ocupado}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className={`btn ${peligro ? 'peligro' : 'p'}`}
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              setError(null);
              try {
                await alConfirmar();
                alCerrar();
              } catch (e) {
                setError(mensajeDe(e));
                setOcupado(false);
              }
            }}
          >
            {ocupado ? 'Procesando…' : confirmar}
          </button>
        </div>
      }
    >
      <div>{texto}</div>
      {error && <div className="notice mal">{error}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- Avisos (toasts)
interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'mal';
}
const ContextoAvisos = createContext<(texto: string, tipo?: 'ok' | 'mal') => void>(() => undefined);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(1);
  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback(
    (texto: string, tipo: 'ok' | 'mal' = 'ok') => {
      const id = siguiente.current++;
      setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
      window.setTimeout(() => quitar(id), tipo === 'mal' ? 8000 : 5000);
    },
    [quitar],
  );
  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo === 'mal' ? 'mal' : ''}`} role={a.tipo === 'mal' ? 'alert' : 'status'}>
            <Icono n={a.tipo === 'mal' ? 'alert' : 'check'} />
            <span>{a.texto}</span>
            <button aria-label="Cerrar aviso" onClick={() => quitar(a.id)}>
              <Icono n="x" t="s" />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

export const useAvisos = () => useContext(ContextoAvisos);
