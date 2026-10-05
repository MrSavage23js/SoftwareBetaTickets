import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { PERMISOS } from '@mesa/shared';
import { Campana } from '../componentes/Campana';
import { Icono, type NombreIcono } from '../componentes/Icono';
import { Cargando, EstadoVacio } from '../componentes/ui';
import { iniciales } from '../lib/formato';
import { VentanaApariencia } from '../componentes/Apariencia';
import { CambioObligatorio, VentanaCambiarPassword } from '../paginas/CambiarPassword';
import { useSesion } from '../sesion/Sesion';

interface ItemMenu {
  a: string;
  texto: string;
  icono: NombreIcono;
  permisos: string[];
  etiqueta?: string;
}

// El menú se arma según los permisos; el servidor vuelve a validar cada petición.
const MENU: ItemMenu[] = [
  { a: '/panel', texto: 'Dashboard', icono: 'chart', permisos: [PERMISOS.PANEL_VER], etiqueta: 'Admin' },
  { a: '/tickets', texto: 'Tickets', icono: 'ticket', permisos: [PERMISOS.TICKETS_VER_PROPIOS, PERMISOS.TICKETS_VER_EMPRESA, PERMISOS.TICKETS_VER_TODOS] },
  { a: '/usuarios', texto: 'Usuarios', icono: 'users', permisos: [PERMISOS.USUARIOS_ADMINISTRAR], etiqueta: 'Admin' },
  { a: '/catalogos', texto: 'Catálogos', icono: 'catalog', permisos: [PERMISOS.CATALOGOS_ADMINISTRAR], etiqueta: 'Admin' },
  { a: '/correos', texto: 'Correos', icono: 'mail', permisos: [PERMISOS.CORREOS_COLA, PERMISOS.CORREOS_PLANTILLAS], etiqueta: 'Admin' },
  { a: '/ajustes', texto: 'Ajustes', icono: 'settings', permisos: [PERMISOS.AJUSTES_ADMINISTRAR], etiqueta: 'Admin' },
];

const CLAVE_CONTRAIDO = 'mesa.menuContraido';
const PANTALLA_ANGOSTA = '(max-width: 900px)';

function leerContraido(): boolean {
  try {
    return localStorage.getItem(CLAVE_CONTRAIDO) === '1';
  } catch {
    return false;
  }
}

function useAngosta(): boolean {
  const [angosta, setAngosta] = useState(() => window.matchMedia(PANTALLA_ANGOSTA).matches);
  useEffect(() => {
    const mq = window.matchMedia(PANTALLA_ANGOSTA);
    const cambio = () => setAngosta(mq.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, []);
  return angosta;
}

export function Estructura() {
  const { usuario, puede, salir } = useSesion();
  const [cambiarPassword, setCambiarPassword] = useState(false);
  const [apariencia, setApariencia] = useState(false);
  // Pantalla ancha: barra contraída a solo íconos (se recuerda). Pantalla angosta: menú desplegable.
  const [contraido, setContraido] = useState(leerContraido);
  const [abierto, setAbierto] = useState(false);
  const angosta = useAngosta();
  if (!usuario) return null;
  if (usuario.debeCambiarPassword) return <CambioObligatorio />;
  const esSoporte = puede(PERMISOS.TICKETS_VER_TODOS);
  const iconos = contraido && !angosta;

  const alternarContraido = () => {
    const nuevo = !contraido;
    setContraido(nuevo);
    try {
      localStorage.setItem(CLAVE_CONTRAIDO, nuevo ? '1' : '0');
    } catch {
      /* sin almacenamiento: solo dura esta visita */
    }
  };

  return (
    <div className={`app${iconos ? ' contraido' : ''}`}>
      <aside className={`side${abierto ? ' abierto' : ''}`}>
        <button
          type="button"
          className="side-toggle"
          aria-label={contraido ? 'Expandir menú' : 'Contraer menú'}
          title={contraido ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!contraido}
          aria-controls="menu-lateral"
          onClick={alternarContraido}
        >
          <Icono n="chevron" />
        </button>
        <div className="logo">
          <span className="mark">
            <Icono n="vela" t="l" />
          </span>
          <span className="marca-txt">
            Sistema de Tickets<small>Soporte técnico</small>
          </span>
          <Campana />
          <button
            type="button"
            className="menu-movil"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            aria-controls="menu-lateral"
            onClick={() => setAbierto((a) => !a)}
          >
            <Icono n={abierto ? 'x' : 'menu'} t="l" />
          </button>
        </div>
        <div className="side-cuerpo" id="menu-lateral" inert={angosta && !abierto}>
          <div className="side-cuerpo-in">
            <nav aria-label="Menú">
              <h3>Menú</h3>
              {MENU.filter((m) => m.permisos.some(puede)).map((m) => {
                const texto = m.a === '/tickets' && !esSoporte ? 'Mis tickets' : m.texto;
                return (
                  <NavLink key={m.a} to={m.a} viewTransition className="navbtn" title={iconos ? texto : undefined} onClick={() => setAbierto(false)}>
                    <Icono n={m.icono} t="l" />
                    <span className="txt">{texto}</span>
                    {m.etiqueta && <span className="tag">{m.etiqueta}</span>}
                  </NavLink>
                );
              })}
            </nav>
            <div className="me">
              <span className="face" aria-hidden="true" title={iconos ? usuario.nombre : undefined}>
                {iniciales(usuario.nombre)}
              </span>
              <div>
                <b title={usuario.nombre}>{usuario.nombre}</b>
                <span>{esSoporte ? usuario.rol.nombre : 'Usuario solicitante'}</span>
              </div>
              <div className="me-acciones">
                <button className="out" aria-label="Apariencia" title="Apariencia: modo y color" onClick={() => setApariencia(true)}>
                  <Icono n="paleta" />
                </button>
                {puede(PERMISOS.USUARIOS_ADMINISTRAR) && (
                  <button className="out" aria-label="Cambiar contraseña" title="Cambiar contraseña" onClick={() => setCambiarPassword(true)}>
                    <Icono n="lock" />
                  </button>
                )}
                <button className="out" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void salir()}>
                  <Icono n="logout" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
      {cambiarPassword && <VentanaCambiarPassword alCerrar={() => setCambiarPassword(false)} />}
      {apariencia && <VentanaApariencia alCerrar={() => setApariencia(false)} />}
    </div>
  );
}

/** Pantalla inicial según el rol: admins al dashboard, solicitantes a sus tickets. */
export function RedireccionInicial() {
  const { puede } = useSesion();
  return <Navigate to={puede(PERMISOS.PANEL_VER) ? '/panel' : '/tickets'} replace />;
}

/** Protege una ruta: sin sesión → inicio de sesión; sin permiso → aviso (el servidor también lo impide). */
export function Protegida({ permisos, children }: { permisos?: string[]; children: ReactNode }) {
  const { estado, puede, reintentar } = useSesion();
  const ubicacion = useLocation();
  if (estado === 'cargando') return <Cargando texto="Cargando el sistema de tickets…" />;
  if (estado === 'sin-servidor') {
    return (
      <EstadoVacio icono="alert" titulo="No se pudo conectar con el servidor" texto="Revisa tu conexión o inténtalo en unos momentos.">
        <button className="btn p" onClick={reintentar}>
          Reintentar
        </button>
      </EstadoVacio>
    );
  }
  if (estado !== 'autenticado') {
    const volver = ubicacion.pathname + ubicacion.search;
    return <Navigate to={`/inicio${volver !== '/' ? `?volver=${encodeURIComponent(volver)}` : ''}`} replace />;
  }
  if (permisos && !permisos.some(puede)) return <SinPermiso />;
  return <>{children}</>;
}

export function SinPermiso() {
  return (
    <div className="pagina" style={{ paddingTop: 32 }}>
      <div className="panel">
        <EstadoVacio icono="lock" titulo="No tienes acceso a esta sección" texto="Si crees que es un error, solicítalo al administrador del sistema.">
          <NavLink className="btn p" to="/tickets">
            Ir a mis tickets
          </NavLink>
        </EstadoVacio>
      </div>
    </div>
  );
}

export function NoEncontrado() {
  return (
    <div className="pagina" style={{ paddingTop: 32 }}>
      <div className="panel">
        <EstadoVacio icono="search" titulo="Esta página no existe" texto="Revisa la dirección o regresa al inicio.">
          <NavLink className="btn p" to="/tickets">
            Ir a tickets
          </NavLink>
        </EstadoVacio>
      </div>
    </div>
  );
}
