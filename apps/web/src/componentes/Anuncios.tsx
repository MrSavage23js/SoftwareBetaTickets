// Banner de anuncios arriba de la pantalla: los que mandan los admins (para todos o para el departamento
// del usuario). Se consulta cada minuto (consulta automática: no cuenta como actividad para la inactividad).
// Los no urgentes se cierran con la ✕ y ya no vuelven a salir; los urgentes se quedan hasta que se retiran.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Anuncio } from '@mesa/shared';
import { api } from '../api/cliente';
import { Icono, type NombreIcono } from './Icono';

const CLAVE = ['anuncios', 'mios'] as const;
const ICONO: Record<Anuncio['tipo'], NombreIcono> = { INFO: 'megafono', ADVERTENCIA: 'alert', URGENTE: 'alert' };

export function BannerAnuncios() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => api.get<Anuncio[]>('/anuncios/mios', undefined, signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (!q.data?.length) return null;

  const cerrar = (id: number) => {
    // Se quita de inmediato; si el servidor falla, vuelve a aparecer en la siguiente consulta.
    qc.setQueryData<Anuncio[]>(CLAVE, (lista) => lista?.filter((a) => a.id !== id));
    void api.post(`/anuncios/${id}/cerrar`).catch(() => qc.invalidateQueries({ queryKey: CLAVE }));
  };

  return (
    <div className="anuncios" role="region" aria-label="Anuncios">
      {q.data.map((a) => (
        <div key={a.id} className={`anuncio ${a.tipo.toLowerCase()}`} role={a.tipo === 'URGENTE' ? 'alert' : 'status'}>
          <Icono n={ICONO[a.tipo]} t="l" />
          <div className="anuncio-txt">
            <b>{a.titulo}</b>
            <span>{a.mensaje}</span>
          </div>
          {a.cerrable && (
            <button type="button" aria-label={`Cerrar anuncio: ${a.titulo}`} title="Cerrar" onClick={() => cerrar(a.id)}>
              <Icono n="x" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
