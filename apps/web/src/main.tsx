import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import './estilos/app.css';
import { PERMISOS } from '@mesa/shared';
import { ErrorCliente, MODO_DEMO } from './api/cliente';
import { ProveedorAvisos } from './componentes/ui';
import { Estructura, NoEncontrado, Protegida } from './diseno/Estructura';
import { ErrorDePagina } from './diseno/ErrorDePagina';
import { Ajustes } from './paginas/Ajustes';
import { Catalogos } from './paginas/Catalogos';
import { Correos } from './paginas/Correos';
import { Inicio } from './paginas/Inicio';
import { Tickets } from './paginas/tickets/Tickets';
import { Usuarios } from './paginas/Usuarios';
import { ProveedorSesion } from './sesion/Sesion';

// En la demo de GitHub Pages las rutas van después de # (Pages no sabe servir /tickets/5).
const Enrutador = MODO_DEMO ? HashRouter : BrowserRouter;

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Reintenta fallas de red o del servidor, nunca errores del usuario (4xx).
      retry: (intentos, e) => !(e instanceof ErrorCliente && e.estado >= 400 && e.estado < 500) && intentos < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ErrorDePagina>
      <QueryClientProvider client={clienteConsultas}>
        <ProveedorAvisos>
          <Enrutador>
            <ProveedorSesion>
              <Routes>
                <Route path="/inicio" element={<Inicio />} />
                <Route
                  element={
                    <Protegida>
                      <Estructura />
                    </Protegida>
                  }
                >
                  <Route index element={<Navigate to="/tickets" replace />} />
                  <Route path="tickets" element={<Tickets />} />
                  <Route path="tickets/:id" element={<Tickets />} />
                  <Route path="usuarios" element={<Protegida permisos={[PERMISOS.USUARIOS_ADMINISTRAR]}><Usuarios /></Protegida>} />
                  <Route path="catalogos" element={<Protegida permisos={[PERMISOS.CATALOGOS_ADMINISTRAR]}><Catalogos /></Protegida>} />
                  <Route path="correos" element={<Protegida permisos={[PERMISOS.CORREOS_COLA, PERMISOS.CORREOS_PLANTILLAS]}><Correos /></Protegida>} />
                  <Route path="ajustes" element={<Protegida permisos={[PERMISOS.AJUSTES_ADMINISTRAR]}><Ajustes /></Protegida>} />
                  <Route path="*" element={<NoEncontrado />} />
                </Route>
              </Routes>
            </ProveedorSesion>
          </Enrutador>
        </ProveedorAvisos>
      </QueryClientProvider>
    </ErrorDePagina>
  </StrictMode>,
);
