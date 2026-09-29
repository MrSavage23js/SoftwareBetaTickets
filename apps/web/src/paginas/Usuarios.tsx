import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Catalogos, UsuarioFila } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Icono } from '../componentes/Icono';
import { Cargando, Confirmar, EstadoError, EstadoVacio, Modal, useAvisos } from '../componentes/ui';
import { fmtFechaCorta, iniciales, plural } from '../lib/formato';
import { useSesion } from '../sesion/Sesion';

interface Rol {
  id: number;
  codigo: string;
  nombre: string;
}

export function Usuarios() {
  const { usuario: yo } = useSesion();
  const avisar = useAvisos();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<UsuarioFila | 'nuevo' | null>(null);
  const [eliminar, setEliminar] = useState<UsuarioFila | null>(null);
  const [cerrarSesion, setCerrarSesion] = useState<UsuarioFila | null>(null);

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: ({ signal }) => api.get<UsuarioFila[]>('/usuarios', undefined, signal),
    // El estatus En línea / Desconectado se actualiza solo.
    refetchInterval: 30_000,
  });
  const refrescar = () => void qc.invalidateQueries({ queryKey: ['usuarios'] });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = usuarios.data ?? [];
    if (!q) return lista;
    return lista.filter((u) => [u.username, u.nombre ?? '', u.email, ...u.empresas.map((e) => e.nombre)].some((v) => v.toLowerCase().includes(q)));
  }, [usuarios.data, busqueda]);

  return (
    <>
      <header className="head">
        <div>
          <h1>Gestión de usuarios</h1>
          <p>Administra los usuarios del sistema</p>
        </div>
        <div className="tools">
          <div className="search">
            <Icono n="search" />
            <input className="inp" type="search" aria-label="Buscar usuarios" placeholder="Buscar por usuario, correo o empresa…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <button className="btn p" onClick={() => setEditando('nuevo')}>
            <Icono n="plus" />
            Agregar usuario
          </button>
        </div>
      </header>

      <div className="pagina" style={{ paddingTop: 20 }}>
        <section className="panel">
          <div className="panel-h">
            <h2>Usuarios registrados</h2>
            {usuarios.data && <span className="count">{plural(usuarios.data.length, 'usuario', 'usuarios')}</span>}
          </div>
          {usuarios.isPending ? (
            <Cargando />
          ) : usuarios.isError ? (
            <EstadoError error={usuarios.error} reintentar={() => void usuarios.refetch()} />
          ) : !filtrados.length ? (
            <EstadoVacio icono="users" titulo={busqueda ? 'Sin coincidencias' : 'No hay usuarios'} />
          ) : (
            <div className="tabla-caja">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Empresas</th>
                    <th>Último inicio de sesión</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => (
                    <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                      <td className="ph">#{u.id}</td>
                      <td>
                        <div className="quien">
                          <span className="avatar" aria-hidden="true">
                            {iniciales(u.nombre || u.username)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.username}</div>
                            <div className="ph" style={{ fontSize: 13 }}>
                              {u.nombre ? `${u.nombre} · ` : ''}
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="count">{u.rol.nombre}</span>
                      </td>
                      <td className="ph" title={u.empresas.map((e) => e.nombre).join(', ')}>
                        {u.empresas.length ? plural(u.empresas.length, 'empresa', 'empresas') : 'Ninguna'}
                      </td>
                      <td className="ph">{u.ultimoLoginAt ? fmtFechaCorta(u.ultimoLoginAt) : 'Nunca'}</td>
                      <td>
                        {!u.activo ? (
                          <span className="pill mal">Inactivo</span>
                        ) : u.enLinea ? (
                          <span className="pill on">
                            <span className="punto" />
                            En línea
                          </span>
                        ) : (
                          <span className="pill off">
                            <span className="punto" />
                            Desconectado
                          </span>
                        )}
                      </td>
                      <td className="acc">
                        <button className="icon-btn chico" aria-label={`Editar ${u.username}`} title="Editar" onClick={() => setEditando(u)}>
                          <Icono n="edit" t="s" />
                        </button>
                        {u.enLinea && u.id !== yo?.id && (
                          <button className="icon-btn chico" aria-label={`Cerrar sesión de ${u.username}`} title="Cerrar sesión" onClick={() => setCerrarSesion(u)}>
                            <Icono n="logout" t="s" />
                          </button>
                        )}
                        {u.id !== yo?.id && (
                          <button className="icon-btn chico" aria-label={`Eliminar ${u.username}`} title="Eliminar" onClick={() => setEliminar(u)}>
                            <Icono n="trash" t="s" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editando && (
        <FormUsuario
          usuario={editando === 'nuevo' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={(u, nuevo) => {
            setEditando(null);
            refrescar();
            avisar(nuevo ? `Usuario ${u.username} registrado.` : `Usuario ${u.username} actualizado.`);
          }}
        />
      )}
      {eliminar && (
        <Confirmar
          titulo="Eliminar usuario"
          peligro
          confirmar="Eliminar usuario"
          texto={
            <p style={{ margin: 0 }}>
              ¿Eliminar a <b>{eliminar.username}</b>? Ya no podrá iniciar sesión y se cerrarán sus sesiones abiertas. <b>Sus tickets se conservan</b> en el historial.
            </p>
          }
          alCerrar={() => setEliminar(null)}
          alConfirmar={async () => {
            await api.delete(`/usuarios/${eliminar.id}`);
            refrescar();
            avisar(`Usuario ${eliminar.username} eliminado.`);
          }}
        />
      )}
      {cerrarSesion && (
        <Confirmar
          titulo="Cerrar sesión"
          confirmar="Cerrar sesión"
          texto={
            <p style={{ margin: 0 }}>
              Se cerrará la sesión de <b>{cerrarSesion.username}</b> en todos sus equipos. Podrá volver a entrar con su contraseña.
            </p>
          }
          alCerrar={() => setCerrarSesion(null)}
          alConfirmar={async () => {
            await api.post(`/usuarios/${cerrarSesion.id}/cerrar-sesion`);
            refrescar();
            avisar(`Se cerró la sesión de ${cerrarSesion.username}.`);
          }}
        />
      )}
    </>
  );
}

function FormUsuario({ usuario, alCerrar, alGuardar }: { usuario: UsuarioFila | null; alCerrar: () => void; alGuardar: (u: UsuarioFila, nuevo: boolean) => void }) {
  const nuevo = usuario === null;
  const roles = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.get<Rol[]>('/usuarios/roles', undefined, signal), staleTime: 5 * 60_000 });
  const cat = useQuery({ queryKey: ['catalogos', 'admin'], queryFn: ({ signal }) => api.get<Catalogos>('/catalogos', { admin: 1 }, signal) });

  const [username, setUsername] = useState(usuario?.username ?? '');
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [rolId, setRolId] = useState(usuario ? String(usuario.rol.id) : '');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [empresas, setEmpresas] = useState<Set<number>>(new Set(usuario?.empresas.map((e) => e.id) ?? []));
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const rolPorDefecto = roles.data?.find((r) => r.codigo === 'USUARIO');
  const rolEfectivo = rolId || (rolPorDefecto ? String(rolPorDefecto.id) : '');
  const listaEmpresas = (cat.data?.empresas ?? []).filter((e) => (e.activa || empresas.has(e.id)) && e.nombre.toLowerCase().includes(filtroEmpresa.toLowerCase()));

  async function guardar() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = 'Escribe el nombre de usuario.';
    if (!email.trim()) e.email = 'Escribe el correo electrónico.';
    if (nuevo && !password) e.password = 'Escribe la contraseña.';
    if (password && password !== confirmar) e.confirmarPassword = 'Las contraseñas no coinciden.';
    if (!rolEfectivo) e.rolId = 'Selecciona el rol.';
    setErrores(e);
    setGeneral(null);
    if (Object.keys(e).length) return;

    setGuardando(true);
    const cuerpo = {
      username: username.trim(),
      nombre: nombre.trim(),
      email: email.trim(),
      rolId: Number(rolEfectivo),
      empresaIds: [...empresas],
      activo,
      password,
      confirmarPassword: confirmar,
    };
    try {
      const r = nuevo ? await api.post<UsuarioFila>('/usuarios', cuerpo) : await api.put<UsuarioFila>(`/usuarios/${usuario.id}`, cuerpo);
      alGuardar(r, nuevo);
    } catch (err) {
      const campos = camposDe(err);
      setErrores(campos);
      setGeneral(Object.keys(campos).length ? 'Revisa los campos marcados.' : mensajeDe(err));
      setGuardando(false);
    }
  }

  const err = (k: string) => errores[k] && <div className="err">{errores[k]}</div>;

  return (
    <Modal
      titulo={nuevo ? 'Nuevo usuario' : `Editar ${usuario.username}`}
      icono="user"
      alCerrar={alCerrar}
      bloqueado={guardando}
      pie={
        <div className="b">
          <button className="btn" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn p" onClick={() => void guardar()} disabled={guardando}>
            <Icono n={nuevo ? 'plus' : 'check'} t="s" />
            {guardando ? 'Guardando…' : nuevo ? 'Registrar usuario' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
      {general && (
        <div className="notice mal" role="alert">
          <Icono n="alert" t="l" />
          <span>{general}</span>
        </div>
      )}
      <div className="rule">Credenciales</div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="u-user">Nombre de usuario</label>
          <input id="u-user" className="inp" autoComplete="off" placeholder="Ej. Laura_Mendez" value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={!!errores.username} />
          {errores.username ? err('username') : <div className="help">Con este nombre inicia sesión.</div>}
        </div>
        <div>
          <label className="lbl" htmlFor="u-nombre">Nombre completo (opcional)</label>
          <input id="u-nombre" className="inp" autoComplete="off" placeholder="Ej. Laura Mendez" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          {err('nombre')}
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="u-email">Correo electrónico</label>
        <input id="u-email" className="inp" type="email" autoComplete="off" placeholder="Ingresa el correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errores.email} />
        {err('email')}
      </div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="u-pass">Contraseña</label>
          <input id="u-pass" className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errores.password} />
          {errores.password ? err('password') : <div className="help">{nuevo ? 'Mínimo 8 caracteres, con letras y números.' : 'Déjala vacía para no cambiarla.'}</div>}
        </div>
        <div>
          <label className="lbl" htmlFor="u-pass2">Confirmar contraseña</label>
          <input id="u-pass2" className="inp" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} aria-invalid={!!errores.confirmarPassword} />
          {err('confirmarPassword')}
        </div>
      </div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="u-rol">Rol</label>
          <select id="u-rol" className="inp" value={rolEfectivo} onChange={(e) => setRolId(e.target.value)} aria-invalid={!!errores.rolId}>
            {!roles.data && <option value="">Cargando…</option>}
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
          {err('rolId')}
        </div>
        {!nuevo && (
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Usuario activo (puede iniciar sesión)
          </label>
        )}
      </div>

      <div className="rule">Empresa / sucursal</div>
      {cat.isPending ? (
        <Cargando />
      ) : cat.isError ? (
        <EstadoError error={cat.error} reintentar={() => void cat.refetch()} />
      ) : (
        <div>
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <input className="inp" style={{ maxWidth: 260, minHeight: 36 }} placeholder="Filtrar empresas…" aria-label="Filtrar empresas" value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn chico" onClick={() => setEmpresas(new Set(cat.data.empresas.filter((e) => e.activa).map((e) => e.id)))}>
                Todas
              </button>
              <button type="button" className="btn chico" onClick={() => setEmpresas(new Set())}>
                Ninguna
              </button>
            </div>
          </div>
          <div className="lista-checks" role="group" aria-label="Empresas asignadas">
            {listaEmpresas.map((e) => (
              <label className="check" key={e.id}>
                <input
                  type="checkbox"
                  checked={empresas.has(e.id)}
                  onChange={(ev) => {
                    const s = new Set(empresas);
                    if (ev.target.checked) s.add(e.id);
                    else s.delete(e.id);
                    setEmpresas(s);
                  }}
                />
                {e.nombre}
                {!e.activa && <span className="pill off">Inactiva</span>}
              </label>
            ))}
            {!listaEmpresas.length && <div className="help" style={{ padding: 8 }}>Sin coincidencias.</div>}
          </div>
          {errores.empresaIds ? err('empresaIds') : <div className="help">Selecciona una o varias empresas ({empresas.size} seleccionadas). El usuario solo podrá crear tickets de estas empresas.</div>}
        </div>
      )}
    </Modal>
  );
}
