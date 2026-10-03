// Estado de la sesión en la web: quién está conectado, sus permisos y el cierre por inactividad.
// La inactividad se mide con la actividad REAL del usuario (ratón, teclado, toques); tener la pestaña
// abierta no mantiene la sesión. Un minuto antes del cierre se muestra un aviso para continuar.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Apariencia, RespuestaSesion, UsuarioSesion } from '@mesa/shared';
import { api, ErrorCliente, EVENTO_SESION_EXPIRADA, fijarCsrf } from '../api/cliente';
import { aplicarApariencia } from '../lib/apariencia';

type Estado = 'cargando' | 'anonimo' | 'autenticado' | 'sin-servidor';

interface Sesion {
  estado: Estado;
  usuario: UsuarioSesion | null;
  /** Mensaje para la pantalla de inicio (p. ej. "Tu sesión se cerró por inactividad"). */
  motivo: string | null;
  puede: (permiso: string) => boolean;
  entrar: (username: string, password: string) => Promise<void>;
  /** Aplica una respuesta de sesión nueva (p. ej. después de cambiar la contraseña). */
  actualizar: (r: RespuestaSesion) => void;
  /** Aplica al instante el modo/paleta y lo guarda para el usuario; si no se guarda, vuelve al anterior. */
  cambiarApariencia: (a: Apariencia) => Promise<void>;
  salir: () => Promise<void>;
  reintentar: () => void;
}

const Contexto = createContext<Sesion | null>(null);

const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
const PING_CADA_MS = 30_000;

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);
  const ultimaActividad = useRef(Date.now());
  const ultimoPing = useRef(Date.now());

  const aplicar = useCallback((r: RespuestaSesion) => {
    fijarCsrf(r.csrfToken);
    aplicarApariencia(r.usuario.apariencia);
    setUsuario(r.usuario);
    setEstado('autenticado');
    setMotivo(null);
    ultimaActividad.current = Date.now();
    ultimoPing.current = Date.now();
  }, []);

  const terminar = useCallback(
    (mensaje: string | null) => {
      fijarCsrf('');
      setUsuario(null);
      setEstado('anonimo');
      setMotivo(mensaje);
      setAviso(false);
      qc.clear();
    },
    [qc],
  );

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      aplicar(await api.get<RespuestaSesion>('/auth/yo'));
    } catch (e) {
      if (e instanceof ErrorCliente && e.estado === 401) terminar(null);
      else setEstado('sin-servidor');
    }
  }, [aplicar, terminar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cualquier 401 de la API (sesión cerrada por inactividad, por un admin, etc.) regresa al inicio.
  useEffect(() => {
    const alExpirar = (e: Event) => terminar((e as CustomEvent<string>).detail || 'Tu sesión terminó. Inicia sesión de nuevo.');
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
  }, [terminar]);

  // Seguimiento de actividad e inactividad.
  useEffect(() => {
    if (estado !== 'autenticado' || !usuario) return;
    const limiteMs = usuario.inactividadMin * 60_000;
    const marcar = () => {
      ultimaActividad.current = Date.now();
    };
    for (const ev of EVENTOS_ACTIVIDAD) window.addEventListener(ev, marcar, { passive: true });

    const reloj = window.setInterval(() => {
      const ahora = Date.now();
      const inactivo = ahora - ultimaActividad.current;
      if (inactivo >= limiteMs) {
        void api.post('/auth/logout').catch(() => undefined);
        terminar('Tu sesión se cerró por inactividad. Inicia sesión de nuevo.');
        return;
      }
      setAviso(inactivo >= limiteMs - 60_000);
      if (ultimaActividad.current > ultimoPing.current && ahora - ultimoPing.current >= PING_CADA_MS) {
        ultimoPing.current = ahora;
        void api.post('/auth/actividad').catch(() => undefined);
      }
    }, 5_000);

    return () => {
      for (const ev of EVENTOS_ACTIVIDAD) window.removeEventListener(ev, marcar);
      window.clearInterval(reloj);
    };
  }, [estado, usuario, terminar]);

  const valor = useMemo<Sesion>(() => {
    const permisos = new Set(usuario?.permisos ?? []);
    return {
      estado,
      usuario,
      motivo,
      puede: (p) => permisos.has(p),
      entrar: async (username, password) => aplicar(await api.post<RespuestaSesion>('/auth/login', { username, password })),
      actualizar: aplicar,
      cambiarApariencia: async (a) => {
        if (!usuario) return;
        const anterior = usuario.apariencia;
        aplicarApariencia(a);
        setUsuario({ ...usuario, apariencia: a });
        try {
          await api.put('/auth/apariencia', a);
        } catch (e) {
          aplicarApariencia(anterior);
          setUsuario((u) => (u ? { ...u, apariencia: anterior } : u));
          throw e;
        }
      },
      salir: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        terminar(null);
      },
      reintentar: () => void cargar(),
    };
  }, [estado, usuario, motivo, aplicar, terminar, cargar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {aviso && (
        <div className="banda-sesion" role="alertdialog" aria-live="assertive">
          <div className="notice" style={{ background: 'var(--surface)', boxShadow: '0 12px 30px rgba(0,0,0,.25)' }}>
            <span>Tu sesión se cerrará en menos de un minuto por inactividad.</span>
            <button
              className="btn p chico"
              onClick={() => {
                ultimaActividad.current = Date.now();
                ultimoPing.current = Date.now();
                setAviso(false);
                void api.post('/auth/actividad').catch(() => undefined);
              }}
            >
              Seguir conectado
            </button>
          </div>
        </div>
      )}
    </Contexto.Provider>
  );
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion fuera de ProveedorSesion');
  return s;
}

/** Usuario garantizado (solo usar dentro de rutas protegidas). */
export function useUsuario(): UsuarioSesion {
  const { usuario } = useSesion();
  if (!usuario) throw new Error('Sin usuario');
  return usuario;
}
