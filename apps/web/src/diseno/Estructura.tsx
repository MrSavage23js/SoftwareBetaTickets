import type { ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { PERMISOS } from '@mesa/shared';
import { Icono, type NombreIcono } from '../componentes/Icono';
import { Cargando, EstadoVacio } from '../componentes/ui';
import { iniciales } from '../lib/formato';
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
  { a: '/tickets', texto: 'Tickets', icono: 'ticket', permisos: [PERMISOS.TICKETS_VER_PROPIOS, PERMISOS.TICKETS_VER_EMPRESA, PERMISOS.TICKETS_VER_TODOS] },
  { a: '/usuarios', texto: 'Usuarios', icono: 'users', permisos: [PERMISOS.USUARIOS_ADMINISTRAR], etiqueta: 'Admin' },
  { a: '/catalogos', texto: 'Catálogos', icono: 'catalog', permisos: [PERMISOS.CATALOGOS_ADMINISTRAR], etiqueta: 'Admin' },
  { a: '/correos', texto: 'Correos', icono: 'mail', permisos: [PERMISOS.CORREOS_COLA, PERMISOS.CORREOS_PLANTILLAS], etiqueta: 'Admin' },
  { a: '/ajustes', texto: 'Ajustes', icono: 'settings', permisos: [PERMISOS.AJUSTES_ADMINISTRAR], etiqueta: 'Admin' },
];

export function Estructura() {
  const { usuario, puede, salir } = useSesion();
  if (!usuario) return null;
  const esSoporte = puede(PERMISOS.TICKETS_VER_TODOS);

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <span className="mark">
            <Icono n="ticket" t="l" />
          </span>
          <span>
            Mesa de Ayuda<small>Soporte técnico</small>
          </span>
        </div>
        <nav aria-label="Menú">
          <h3>Menú</h3>
          {MENU.filter((m) => m.permisos.some(puede)).map((m) => (
            <NavLink key={m.a} to={m.a} className="navbtn">
              <Icono n={m.icono} t="l" />
              {m.a === '/tickets' && !esSoporte ? 'Mis tickets' : m.texto}
              {m.etiqueta && <span className="tag">{m.etiqueta}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <span className="face" aria-hidden="true">
            {iniciales(usuario.nombre)}
          </span>
          <div>
            <b title={usuario.nombre}>{usuario.nombre}</b>
            <span>{esSoporte ? usuario.rol.nombre : 'Usuario solicitante'}</span>
          </div>
          <button className="out" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void salir()}>
            <Icono n="logout" />
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}

/** Protege una ruta: sin sesión → inicio de sesión; sin permiso → aviso (el servidor también lo impide). */
export function Protegida({ permisos, children }: { permisos?: string[]; children: ReactNode }) {
  const { estado, puede, reintentar } = useSesion();
  const ubicacion = useLocation();
  if (estado === 'cargando') return <Cargando texto="Cargando la Mesa de Ayuda…" />;
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
