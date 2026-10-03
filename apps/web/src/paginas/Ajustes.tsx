import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AjusteFila } from '@mesa/shared';
import { api, camposDe, mensajeDe } from '../api/cliente';
import { Cargando, EstadoError, useAvisos } from '../componentes/ui';

interface Respuesta {
  ajustes: AjusteFila[];
  servidor: { transporteCorreo: string; remitente: string; adjuntosTechoMb: number; zonaHoraria: string; url: string };
}

const GRUPOS: { titulo: string; claves: string[] }[] = [
  { titulo: 'Sesión y acceso', claves: ['sesion.inactividad_min', 'sesion.max_horas', 'login.max_intentos', 'login.bloqueo_min', 'password.min_caracteres'] },
  { titulo: 'Archivos adjuntos', claves: ['adjuntos.max_mb', 'adjuntos.max_por_mensaje', 'adjuntos.tipos'] },
  { titulo: 'Correos', claves: ['correo.respuestas_activas', 'correo.aviso_soporte_activo', 'correo.aviso_cierre_activo', 'correo.aviso_soporte_destino'] },
  { titulo: 'Bandeja', claves: ['kanban.tarjetas_por_columna'] },
];

export function Ajustes() {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const q = useQuery({ queryKey: ['ajustes'], queryFn: ({ signal }) => api.get<Respuesta>('/ajustes', undefined, signal) });
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (q.data) setValores(Object.fromEntries(q.data.ajustes.map((a) => [a.clave, a.valor])));
  }, [q.data]);

  if (q.isPending) return <Cargando />;
  if (q.isError) return <div className="pagina"><EstadoError error={q.error} reintentar={() => void q.refetch()} /></div>;
  const porClave = new Map(q.data.ajustes.map((a) => [a.clave, a]));

  async function guardar() {
    setGuardando(true);
    try {
      const cuerpo = { ...valores };
      if (typeof cuerpo['adjuntos.tipos'] === 'string') {
        cuerpo['adjuntos.tipos'] = (cuerpo['adjuntos.tipos'] as string).split(',').map((s) => s.trim()).filter(Boolean);
      }
      await api.put('/ajustes', cuerpo);
      setErrores({});
      avisar('Ajustes guardados. Se aplican de inmediato (los tiempos de sesión, en el siguiente inicio de sesión).');
      void qc.invalidateQueries({ queryKey: ['ajustes'] });
    } catch (e) {
      setErrores(camposDe(e));
      avisar(mensajeDe(e), 'mal');
    } finally {
      setGuardando(false);
    }
  }

  const control = (a: AjusteFila) => {
    const v = valores[a.clave];
    const id = `aj-${a.clave}`;
    if (typeof a.valor === 'boolean') {
      return (
        <label className="check">
          <input id={id} type="checkbox" checked={!!v} onChange={(e) => setValores({ ...valores, [a.clave]: e.target.checked })} />
          {a.descripcion}
        </label>
      );
    }
    return (
      <div>
        <label className="lbl" htmlFor={id}>{a.descripcion}</label>
        <input
          id={id}
          className="inp"
          type={typeof a.valor === 'number' ? 'number' : 'text'}
          value={Array.isArray(v) ? v.join(', ') : String(v ?? '')}
          onChange={(e) => setValores({ ...valores, [a.clave]: typeof a.valor === 'number' ? Number(e.target.value) : e.target.value })}
          aria-invalid={!!errores[a.clave]}
        />
        {errores[a.clave] && <div className="err">{errores[a.clave]}</div>}
      </div>
    );
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Ajustes</h1>
          <p>Reglas del sistema que se cambian sin tocar código</p>
        </div>
        <div className="tools">
          <button className="btn p" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        </div>
      </header>
      <div className="pagina" style={{ paddingTop: 20 }}>
        {GRUPOS.map((g) => (
          <section className="panel" key={g.titulo}>
            <div className="panel-h">
              <h2>{g.titulo}</h2>
            </div>
            <div className="detail" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {g.claves.map((k) => porClave.get(k)).filter((a): a is AjusteFila => !!a).map((a) => <div key={a.clave}>{control(a)}</div>)}
            </div>
          </section>
        ))}
        <section className="panel">
          <div className="panel-h">
            <h2>Configuración del servidor (.env)</h2>
            <span className="help" style={{ margin: 0 }}>Solo lectura: se cambia en el archivo .env y reiniciando el servicio.</span>
          </div>
          <div className="detail meta">
            <div className="cell"><small>Envío de correo</small><div>{q.data.servidor.transporteCorreo}</div></div>
            <div className="cell"><small>Remitente</small><div>{q.data.servidor.remitente}</div></div>
            <div className="cell"><small>Techo de archivos</small><div>{q.data.servidor.adjuntosTechoMb} MB</div></div>
            <div className="cell"><small>Zona horaria</small><div>{q.data.servidor.zonaHoraria}</div></div>
          </div>
        </section>
      </div>
    </>
  );
}
