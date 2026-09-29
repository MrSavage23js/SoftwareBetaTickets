import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Catalogos, ContadoresEstatus, EventoInfo, Paginado, TicketDetalle, TicketResumen, UsuarioRef } from '@mesa/shared';
import { api } from '../../api/cliente';

export type ListaTickets = Paginado<TicketResumen> & { contadores: ContadoresEstatus };
export type Filtros = Record<string, string | number | undefined>;

export const claves = {
  lista: (f: Filtros) => ['tickets', 'lista', f] as const,
  columna: (f: Filtros) => ['tickets', 'columna', f] as const,
  detalle: (id: number) => ['tickets', 'detalle', id] as const,
  historial: (id: number) => ['tickets', 'historial', id] as const,
};

export function useCatalogos() {
  return useQuery({ queryKey: ['catalogos'], queryFn: ({ signal }) => api.get<Catalogos>('/catalogos', undefined, signal), staleTime: 5 * 60_000 });
}

export function useTecnicos(activo = true) {
  return useQuery({
    queryKey: ['tecnicos'],
    queryFn: ({ signal }) => api.get<(Omit<UsuarioRef, 'nombre'> & { nombre: string })[]>('/usuarios/tecnicos', undefined, signal),
    staleTime: 5 * 60_000,
    enabled: activo,
  });
}

export function useListaTickets(f: Filtros) {
  return useQuery({
    queryKey: claves.lista(f),
    queryFn: ({ signal }) => api.get<ListaTickets>('/tickets', f, signal),
    placeholderData: keepPreviousData,
    // La bandeja se refresca sola cada 30 s para ver tickets nuevos sin recargar.
    refetchInterval: 30_000,
  });
}

export function useDetalle(id: number | null) {
  return useQuery({
    queryKey: claves.detalle(id ?? 0),
    queryFn: ({ signal }) => api.get<TicketDetalle>(`/tickets/${id}`, undefined, signal),
    enabled: id !== null,
    refetchInterval: 30_000,
  });
}

export function useHistorial(id: number, activo: boolean) {
  return useQuery({
    queryKey: claves.historial(id),
    queryFn: ({ signal }) => api.get<EventoInfo[]>(`/tickets/${id}/historial`, undefined, signal),
    enabled: activo,
  });
}

/** Después de cualquier cambio a un ticket se refrescan la lista, el Kanban y el detalle. */
export function useRefrescarTickets() {
  const qc = useQueryClient();
  return (id?: number) => {
    void qc.invalidateQueries({ queryKey: ['tickets', 'lista'] });
    void qc.invalidateQueries({ queryKey: ['tickets', 'columna'] });
    if (id) {
      void qc.invalidateQueries({ queryKey: claves.detalle(id) });
      void qc.invalidateQueries({ queryKey: claves.historial(id) });
    }
  };
}
