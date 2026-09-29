// "Enviar copia a": busca usuarios del sistema y también acepta un correo escrito a mano (DECISIONES P3).
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/cliente';
import { Icono } from './Icono';

export interface Contacto {
  usuarioId?: number;
  email: string;
  nombre?: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SelectorContactos({ id, valor, alCambiar }: { id: string; valor: Contacto[]; alCambiar: (c: Contacto[]) => void }) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const lista = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setBusqueda(texto.trim()), 250);
    return () => window.clearTimeout(t);
  }, [texto]);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['contactos', busqueda],
    queryFn: ({ signal }) => api.get<{ id: number; nombre: string; email: string }[]>('/usuarios/contactos', { q: busqueda }, signal),
    enabled: busqueda.length >= 2,
    staleTime: 60_000,
  });

  const elegidos = new Set(valor.map((v) => v.email.toLowerCase()));
  const opciones: Contacto[] = resultados
    .filter((r) => !elegidos.has(r.email.toLowerCase()))
    .map((r) => ({ usuarioId: r.id, email: r.email, nombre: r.nombre }));
  if (CORREO.test(texto.trim()) && !elegidos.has(texto.trim().toLowerCase()) && !opciones.some((o) => o.email.toLowerCase() === texto.trim().toLowerCase())) {
    opciones.push({ email: texto.trim().toLowerCase() });
  }

  const agregar = (c: Contacto) => {
    alCambiar([...valor, c]);
    setTexto('');
    setBusqueda('');
    setIndice(0);
  };

  return (
    <div className="combo">
      {valor.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {valor.map((c) => (
            <span className="chip" key={c.email}>
              {c.nombre ?? c.email}
              <button type="button" aria-label={`Quitar ${c.nombre ?? c.email}`} onClick={() => alCambiar(valor.filter((v) => v.email !== c.email))}>
                <Icono n="x" t="s" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className="inp"
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto && opciones.length > 0}
        aria-controls={lista}
        placeholder="Escribe un nombre o un correo…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setIndice(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndice((i) => Math.min(i + 1, opciones.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && opciones[indice]) {
            e.preventDefault();
            agregar(opciones[indice]);
          } else if (e.key === 'Backspace' && !texto && valor.length) {
            alCambiar(valor.slice(0, -1));
          }
        }}
      />
      {abierto && texto.trim().length >= 2 && (
        <div className="opciones" id={lista} role="listbox">
          {opciones.map((o, i) => (
            <button type="button" key={o.email} role="option" aria-selected={i === indice} onMouseDown={(e) => e.preventDefault()} onClick={() => agregar(o)}>
              <span>{o.nombre ?? `Enviar a ${o.email}`}</span>
              <small>{o.usuarioId ? o.email : 'Correo externo'}</small>
            </button>
          ))}
          {!opciones.length && <div className="help" style={{ padding: '8px 10px' }}>{isFetching ? 'Buscando…' : 'Sin coincidencias. Escribe un correo completo para agregarlo.'}</div>}
        </div>
      )}
    </div>
  );
}
