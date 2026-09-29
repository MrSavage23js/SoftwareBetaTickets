import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Cargando } from '../componentes/ui';
import { useSesion } from '../sesion/Sesion';

/**
 * Solo rutas internas ('/tickets'): nunca '//sitio.com' ni '/\sitio.com', que el navegador
 * interpreta como otro dominio (redirección abierta).
 */
export function esRutaInterna(ruta: string): boolean {
  return ruta.startsWith('/') && ruta[1] !== '/' && ruta[1] !== '\\';
}

/** Pantalla "Inicio" de la maqueta: inicio de sesión con usuario y contraseña. */
export function Inicio() {
  const { estado, entrar, motivo } = useSesion();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const volver = params.get('volver');
  const destino = volver && esRutaInterna(volver) ? volver : '/tickets';

  if (estado === 'cargando') return <Cargando />;
  if (estado === 'autenticado') return <Navigate to={destino} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Escribe tu nombre de usuario y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await entrar(username.trim(), password);
      navegar(destino, { replace: true });
    } catch (err) {
      setError(mensajeDe(err));
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  const aviso = error ?? motivo;
  return (
    <div className="login">
      <div className="brandside">
        <div className="logo">
          <span className="mark">
            <Icono n="ticket" t="l" />
          </span>
          Mesa de Ayuda
        </div>
        <div>
          <h2>Sistema de soporte técnico</h2>
          <p className="lede">Crea solicitudes, da seguimiento a tus tickets y recibe los avisos en tu correo Outlook.</p>
        </div>
        <div style={{ color: '#8FA1AF', fontSize: 13 }}>Grupo Aramo</div>
      </div>
      <div className="formside">
        <form onSubmit={enviar} noValidate>
          <div>
            <h1>Iniciar sesión</h1>
            <p>Entra con el usuario que te asignó el administrador.</p>
          </div>
          {aviso && (
            <div className={`notice ${error ? 'mal' : 'gray'}`} role="alert">
              <Icono n={error ? 'alert' : 'clock'} t="l" />
              <span>{aviso}</span>
            </div>
          )}
          <div>
            <label className="lbl" htmlFor="l-user">
              Nombre de usuario
            </label>
            <input className="inp" id="l-user" type="text" autoComplete="username" autoFocus placeholder="Ingresa tu nombre de usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="l-pass">
              Contraseña
            </label>
            <input className="inp" id="l-pass" type="password" autoComplete="current-password" placeholder="Ingresa tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn p" type="submit" style={{ width: '100%' }} disabled={enviando}>
            {enviando ? 'Entrando…' : 'Iniciar sesión'}
          </button>
          <div className="foot">¿No tienes acceso? Solicítalo al administrador del sistema.</div>
        </form>
      </div>
    </div>
  );
}
