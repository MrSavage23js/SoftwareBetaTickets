# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [0.1.0] — 2026-09-29

Primera versión funcional completa, **sin suite de pruebas automatizadas** (se pospuso a petición del usuario; ver `DECISIONES.md` §E).

### Agregado
- **Base del proyecto**: monorepo (`packages/shared`, `apps/api`, `apps/web`), TypeScript estricto, ESLint, Prettier, `npm run ci` (CI local), MySQL 8.4 portátil para Windows (`npm run db:local`), Docker Compose con MySQL y Mailpit.
- **Base de datos**: migración con las 21 tablas del modelo (`docs/MODELO_DATOS.md`) y seeds idempotentes (roles, permisos, estatus, 17 empresas, 6 tipos, 7 módulos, 4 plantillas, ajustes y admin inicial).
- **Acceso**: inicio de sesión con argon2id; sesión en BD con cookie httpOnly/SameSite=Strict; cierre por inactividad real con aviso previo; bloqueo tras intentos fallidos; CSRF en tres capas; permisos por tabla; rutas protegidas en servidor y en pantalla.
- **Tickets**: folio `EE`+`TT`-consecutivo sin duplicados bajo concurrencia; creación en una sola transacción (ticket, copias, adjuntos, historial y correo); lista agrupada por día con filtros, búsqueda y paginación en servidor; detalle con barra de avance; comentarios y adjuntos; tomar (atómico), pausar/reanudar, reasignar, responder, cerrar con resolución obligatoria; historial completo; Kanban con "Ver más".
- **Usuarios**: tabla con estatus En línea/Desconectado real, alta/edición con varias empresas, cierre de sesión remoto, baja lógica con confirmación.
- **Catálogos** administrables (empresas, tipos, módulos) con códigos de folio.
- **Correo**: cola en BD con reintentos progresivos; transportes consola, SMTP y Microsoft Graph; plantillas editables con vista previa; correos de respuesta apagados por defecto.
- **Seguridad**: HTML sanitizado en servidor; adjuntos verificados por contenido, con nombre aleatorio y descarga con permiso; helmet + CSP; límites de peticiones; validación zod con mensajes en español; registros pino sin datos sensibles.
- **Operación**: `/health`, cierre ordenado, respaldo (`npm run respaldo`) y restauración verificada (`npm run restaurar`).
- **Documentación**: README, `docs/EXTENDER.md`, `docs/DESPLIEGUE.md`, `docs/CORREO_M365.md`, `CHECKLIST_QA.md`, punto previsto de importación.
