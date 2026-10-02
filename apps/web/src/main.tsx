import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Archivo variable con eje de ancho: expandida en títulos y folios, normal en el texto.
import '@fontsource-variable/archivo/wdth.css';
import './estilos/app.css';
import { PERMISOS } from '@mesa/shared';
import { ErrorCliente } from './api/cliente';
import { ProveedorAvisos } from './componentes/ui';
import { Estructura, NoEncontrado, Protegida, RedireccionInicial } from './diseno/Estructura';
import { ErrorDePagina } from './diseno/ErrorDePagina';
import { Ajustes } from './paginas/Ajustes';
import { Panel } from './paginas/Panel';
import { Catalogos } from './paginas/Catalogos';
import { Correos } from './paginas/Correos';
import { Inicio } from './paginas/Inicio';
import { Tickets } from './paginas/tickets/Tickets';
import { Usuarios } from './paginas/Usuarios';
import { ProveedorSesion } from './sesion/Sesion';

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
          <BrowserRouter>
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
                  <Route index element={<RedireccionInicial />} />
                  <Route path="panel" element={<Protegida permisos={[PERMISOS.PANEL_VER]}><Panel /></Protegida>} />
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
          </BrowserRouter>
        </ProveedorAvisos>
      </QueryClientProvider>
    </ErrorDePagina>
  </StrictMode>,
);
