// Banner de anuncios arriba de la pantalla: los que mandan los admins (para todos o para el departamento
// del usuario). Se consulta cada 15 s, al cambiar de página y al volver a la pestaña, para que quien ya
// está dentro lo vea casi en cuanto se manda (consulta automática: no cuenta como actividad).
// Los no urgentes se cierran con la ✕ y ya no vuelven a salir; los urgentes se quedan hasta que se retiran.
// Se muestra uno a la vez (urgentes primero) con ‹ 1 de 3 › para no empujar la pantalla hacia abajo;
// si llega uno nuevo, se salta a él para que se note. Animaciones (CSS): al cambiar se desliza hacia el
// lado de la flecha y al cerrar sale deslizándose; se apagan con "reducir movimiento" o en Apariencia.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Anuncio } from '@mesa/shared';
import { api } from '../api/cliente';
import { menosMovimiento } from '../lib/movimiento';
import { Icono, type NombreIcono } from './Icono';

const CLAVE = ['anuncios', 'mios'] as const;
const ICONO: Record<Anuncio['tipo'], NombreIcono> = { INFO: 'megafono', ADVERTENCIA: 'alert', URGENTE: 'alert' };
const ETIQUETA: Record<Anuncio['tipo'], string> = { INFO: 'Información', ADVERTENCIA: 'Aviso importante', URGENTE: 'Urgente' };
const SALIDA_MS = 220;

const sinAnimaciones = () => menosMovimiento() || document.documentElement.dataset.animaciones === 'no';

export function BannerAnuncios() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => api.get<Anuncio[]>('/anuncios/mios', undefined, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  // Al cambiar de página, revisa si hay anuncios nuevos (si la última consulta ya tiene unos segundos).
  const { pathname } = useLocation();
  useEffect(() => {
    if (Date.now() - q.dataUpdatedAt > 5_000) void q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cuál se muestra: se sigue por id, así no "brinca" cuando la lista cambia por otro anuncio.
  const [actualId, setActualId] = useState<number | null>(null);
  // Hacia dónde entra el que se muestra: '' = cae desde arriba (primero o nuevo), sig/ant = de lado.
  const [dir, setDir] = useState<'' | 'sig' | 'ant'>('');
  const [saliendo, setSaliendo] = useState<number | null>(null);
  const vistos = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const nuevo = vistos.current && q.data.find((a) => !vistos.current!.has(a.id));
    if (nuevo) {
      setDir('');
      setActualId(nuevo.id);
    }
    vistos.current = new Set(q.data.map((a) => a.id));
  }, [q.data]);

  const lista = q.data ?? [];
  if (!lista.length) return null;
  const i = Math.max(0, lista.findIndex((a) => a.id === actualId));
  const a = lista[i]!;
  const ir = (paso: number) => {
    setDir(paso > 0 ? 'sig' : 'ant');
    setActualId(lista[(i + paso + lista.length) % lista.length]!.id);
  };

  const cerrar = (id: number) => {
    if (saliendo !== null) return;
    // Se quita (tras la animación de salida) y queda el siguiente; si el servidor falla, vuelve en la
    // siguiente consulta.
    void api.post(`/anuncios/${id}/cerrar`).catch(() => qc.invalidateQueries({ queryKey: CLAVE }));
    const quitar = () => {
      const siguiente = lista[i + 1] ?? lista[i - 1];
      setSaliendo(null);
      setDir('sig');
      setActualId(siguiente ? siguiente.id : null);
      qc.setQueryData<Anuncio[]>(CLAVE, (l) => l?.filter((x) => x.id !== id));
    };
    if (sinAnimaciones()) return quitar();
    setSaliendo(id);
    window.setTimeout(quitar, SALIDA_MS);
  };

  return (
    <div className="anuncios" role="region" aria-label="Anuncios">
      <div
        key={a.id}
        className={['anuncio', a.tipo.toLowerCase(), dir && `desde-${dir}`, saliendo === a.id && 'saliendo'].filter(Boolean).join(' ')}
        role={a.tipo === 'URGENTE' ? 'alert' : 'status'}
      >
        <span className="anuncio-ico" aria-hidden="true">
          <Icono n={ICONO[a.tipo]} t="l" />
        </span>
        <div className="anuncio-txt">
          <small>{ETIQUETA[a.tipo]}</small>
          <b>{a.titulo}</b>
          <span>{a.mensaje}</span>
        </div>
        <div className="anuncio-acc">
          {lista.length > 1 && (
            <div className="anuncio-nav">
              <button type="button" aria-label="Anuncio anterior" title="Anterior" onClick={() => ir(-1)}>
                <Icono n="chevron" />
              </button>
              <span>
                {i + 1} de {lista.length}
              </span>
              <button type="button" className="sig" aria-label="Anuncio siguiente" title="Siguiente" onClick={() => ir(1)}>
                <Icono n="chevron" />
              </button>
            </div>
          )}
          {a.cerrable && (
            <button type="button" aria-label={`Cerrar anuncio: ${a.titulo}`} title="Cerrar" onClick={() => cerrar(a.id)}>
              <Icono n="x" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
