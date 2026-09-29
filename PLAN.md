# PLAN — Mesa de Ayuda (Grupo Aramo)

> Estado: **propuesta, pendiente de aprobación.** No se ha escrito código.
> Documentos hermanos: `DECISIONES.md` (supuestos y preguntas `CONFIRMAR`) y `docs/MODELO_DATOS.md` (base de datos).

## 1. Pila tecnológica propuesta

| Capa | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript en todo el proyecto | Tipos compartidos entre servidor y pantalla; menos errores al hacer cambios después. |
| Runtime | Node.js 24 LTS | Versión con soporte largo. |
| Servidor HTTP | Express 5 | Maduro, compatible con helmet, rate limit, multer y Supertest. |
| Base de datos | MySQL 8.4 LTS (o MariaDB 11 LTS) | El prompt pide `mysqldump`; tiene `SELECT … FOR UPDATE SKIP LOCKED` para la cola de correo. |
| Acceso a datos | Kysely + mysql2, con migraciones de Kysely | SQL explícito (bloqueos, índices, FULLTEXT) con tipos, sin la "magia" de un ORM. |
| Validación | zod (esquemas compartidos en `packages/shared`) | Una sola definición para servidor y formularios. |
| Contraseñas | argon2id | Recomendación actual de OWASP. |
| HTML enriquecido | TipTap (editor) + `sanitize-html` en servidor con lista blanca | La barra de la maqueta (negrita, cursiva, subrayado, listas, color, enlace, imagen, quitar formato) coincide con TipTap. |
| Correo | Microsoft Graph (`@azure/msal-node`) · SMTP (`nodemailer`) · consola (archivo `.eml`) | Se elige con `MAIL_TRANSPORT` en `.env`. |
| Registros | pino (con `redact` para contraseñas, cookies y tokens) | |
| Pantallas | React 19 + Vite + React Router + TanStack Query | TanStack Query da estados de carga, error y reintento de forma uniforme. |
| Estilos | Los tokens y clases de la maqueta, convertidos en CSS global + CSS Modules | Se respeta el diseño tal cual (claro y oscuro). |
| Pruebas | Vitest (unitarias), Supertest (API), Playwright (recorridos completos) | |
| Calidad | ESLint + Prettier + `tsc --noEmit` | |
| Contenedores | Docker Compose para desarrollo (MySQL + Mailpit opcional) | En producción depende del servidor (ver `DECISIONES.md` P8). |

En producción corre **un solo proceso Node** que sirve la API (`/api/*`) y la aplicación web ya compilada. Así se instala más fácil y no hay que configurar CORS. El trabajador de la cola de correo corre dentro del mismo proceso, pero está hecho de forma que después se pueda separar.

## 2. Estructura de carpetas

```
mesa-de-ayuda/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/            env.ts (zod sobre process.env), ajustes en BD con caché
│   │   │   ├── db/
│   │   │   │   ├── migraciones/   0001_base.ts, 0002_…  (solo hacia adelante)
│   │   │   │   └── seeds/         catálogos, roles/permisos, plantillas, ajustes, admin inicial
│   │   │   ├── middleware/        sesión, csrf, permisos, rate-limit, errores, request-id
│   │   │   ├── lib/               logger, errores de dominio, sanitizar-html, fechas, paginación
│   │   │   ├── modulos/
│   │   │   │   ├── auth/          rutas · servicio · repositorio · esquemas
│   │   │   │   ├── usuarios/
│   │   │   │   ├── catalogos/     empresas, tipos, módulos
│   │   │   │   ├── tickets/       maquina-estados.ts, folio.ts, bandeja, detalle, acciones
│   │   │   │   ├── adjuntos/      almacenamiento local, descarga con permiso
│   │   │   │   ├── correos/       cola, trabajador, plantillas, transportes/{graph,smtp,consola}
│   │   │   │   ├── ajustes/
│   │   │   │   ├── eventos/       historial de ticket + auditoría (punto de enganche para reportes)
│   │   │   │   └── importacion/   PREVISTO: solo README e interfaz, sin implementar
│   │   │   ├── app.ts             arma Express (sin escuchar puerto; así lo usa Supertest)
│   │   │   └── server.ts          escucha, arranca el trabajador, cierre ordenado
│   │   └── test/                  unitarias + API (Supertest) contra una BD de pruebas
│   └── web/
│       └── src/
│           ├── api/               cliente fetch con CSRF y manejo de errores
│           ├── componentes/       Editor, Pill, Pasos, Modal, EstadoVacio, EstadoError…
│           ├── paginas/           Inicio, MisTickets, Bandeja, Kanban, Usuarios, Catalogos, Plantillas, Ajustes
│           ├── estilos/           tokens.css (de la maqueta), base.css
│           └── rutas.tsx          rutas protegidas por permiso
├── packages/shared/               esquemas zod, códigos de estatus y transiciones, permisos, tipos DTO
├── e2e/                           Playwright
├── scripts/                       respaldo.(sh|ps1), restaurar.(sh|ps1), crear-admin, ci-local
├── docker/                        docker-compose.yml (mysql, mailpit), my.cnf
├── docs/                          MODELO_DATOS.md, EXTENDER.md, DESPLIEGUE.md, CORREO_M365.md, RESPALDOS.md
├── referencia/                    maqueta y capturas del sistema actual
├── storage/                       (fuera de git) adjuntos/, correos-consola/, respaldos/
├── .env.example
├── README.md · CHANGELOG.md · DECISIONES.md · CHECKLIST_QA.md · PLAN.md
```

## 3. Fases y criterios de terminado

**Regla para cerrar cualquier fase:** `npm run ci` en verde (lint + tipos + unitarias + API + build), las pruebas e2e de la fase en verde, commit con mensaje descriptivo, y `DECISIONES.md` y `CHANGELOG.md` actualizados. Al cerrar cada fase te muestro qué quedó funcionando y cómo lo probé.

### Fase 0 — Proyecto base
- `git init`, monorepo con workspaces de npm, TypeScript estricto, ESLint y Prettier.
- `docker-compose.yml` con MySQL 8.4 (y Mailpit para ver correos SMTP en desarrollo).
- `.env.example` completo y comentado. `env.ts` valida con zod y **no arranca** si falta una variable obligatoria (con un mensaje claro).
- Esqueleto de API con `/health` (revisa la BD), logger pino, manejo global de errores y cierre ordenado (SIGTERM/SIGINT: deja de aceptar peticiones, espera a las que están en curso, detiene el trabajador y cierra el pool).
- Esqueleto web con los tokens de la maqueta.
- `npm run ci` (CI local) y, de regalo, el mismo flujo en `.github/workflows/ci.yml` por si después se sube a GitHub.
- **Terminado cuando:** `docker compose up` + `npm run dev` levantan todo; `/health` responde 200 con BD arriba y 503 con BD abajo; hay una prueba de ejemplo de cada tipo (unitaria, API y e2e) pasando.

### Fase 1 — BD, autenticación, sesiones y permisos
- Migración base con **todas** las tablas del modelo (así las fases siguientes no necesitan migraciones grandes) y seeds de catálogos, roles, permisos, estatus, plantillas y ajustes.
- Script `crear-admin` y admin inicial desde `.env`.
- Inicio de sesión con usuario y contraseña (argon2id). Cookie `httpOnly`, `Secure`, `SameSite=Strict`; en la BD solo se guarda el hash SHA-256 del token.
- Cierre por inactividad (configurable) + duración máxima absoluta de la sesión. Aviso en pantalla un minuto antes.
- Bloqueo temporal tras N intentos fallidos por usuario, más límite de peticiones por IP en `/api/auth/login`.
- CSRF con token sincronizado (guardado en la sesión y enviado en el encabezado `X-CSRF-Token`).
- Middleware `requierePermiso('codigo')`, y en la web rutas y menú según los permisos que devuelve `/api/auth/yo`.
- Pantalla **Inicio** idéntica a la maqueta.
- **Terminado cuando:** hay pruebas de login correcto e incorrecto, bloqueo, expiración por inactividad, cierre de sesión, CSRF rechazado y un 403 al forzar una URL de admin, tanto en API como en e2e.

### Fase 2 — Usuarios y empresas asignadas
- Pantalla **Usuarios**: ID, usuario, rol, último inicio ("Nunca" si es nulo), En línea/Desconectado (calculado con las sesiones vivas, no con un indicador guardado), acciones editar / cerrar sesión (solo si está en línea) / eliminar.
- Registrar y editar: nombre de usuario, nombre para mostrar, correo, contraseña + confirmación (opcional al editar), rol, varias empresas (lista con casillas y buscador).
- Eliminar pide confirmación dentro de la página, hace una **baja lógica**, cierra todas sus sesiones y conserva sus tickets.
- Un admin no puede eliminarse a sí mismo ni dejar el sistema sin ningún admin activo.
- **Terminado cuando:** hay pruebas API de alta, edición, baja, cierre de sesión remoto, validaciones (correo inválido, contraseñas que no coinciden, usuario duplicado) y accesos denegados, más el recorrido e2e de alta → edición → cierre de sesión → baja.

### Fase 3 — Catálogos administrables
- Empresas, tipos de solicitud y módulos: crear, editar, activar/desactivar, ordenar. Cada uno con su código para el folio.
- En tipos de solicitud: el título de la sección ("Detalle de la corrección") y si piden módulo y folio(s).
- Validación: códigos únicos en mayúsculas; no se borra, solo se desactiva; aviso si se cambia un código que ya se usó en folios.
- **Terminado cuando:** hay pruebas API de cada catálogo (incluidos códigos duplicados y accesos denegados) y los catálogos desactivados ya no aparecen en "Nuevo ticket", pero los tickets viejos se siguen viendo.

### Fase 4 — Tickets del usuario
- **Nuevo ticket** tal como la maqueta: primero el tipo, luego el formulario; empresas limitadas a las asignadas (el servidor también lo revisa); editor enriquecido; adjunto(s); "Enviar copia a".
- Una sola transacción: folio + ticket + copias + adjuntos + evento `CREADO` + correo(s) en la cola (la tabla de salida se crea aquí; los envíos reales llegan en la fase 6).
- Folio sin repetirse aunque haya concurrencia (ver el modelo de datos).
- **Mis tickets**: agrupados por día, filtros por estatus, búsqueda, paginación en servidor, detalle con la barra de avance, conversación, comentarios y adjuntos mientras el ticket no esté Completado.
- Confirmación con el folio y el aviso de correo.
- **Terminado cuando:** hay pruebas unitarias de folio (incluidas 50 creaciones en paralelo sin duplicados) y de la sanitización (casos de XSS conocidos); pruebas API de crear, listar, detalle, comentar, adjuntar y de ver o modificar un ticket ajeno (404); y e2e de crear y ver.

### Fase 5 — Admin soporte
- Bandeja con pestañas por estatus y contadores, búsqueda (folio, concepto, solicitante, empresa, folio(s)), filtros (tipo, empresa, módulo, técnico, rango de fechas) guardados en la URL.
- Vista Lista + detalle y vista **Kanban** (clic abre el detalle; máximo 50 tarjetas por columna con "Ver más" paginado).
- Acciones: **Tomar** (atómico, con 409 claro si otro ya lo tomó), **Pausar** (motivo) / **Reanudar**, **Reasignar**, **Responder** (editor + adjuntos), **Cerrar** (resolución obligatoria + correo en la cola).
- Máquina de estados en `packages/shared`, usada por el servidor (que decide) y por la web (que solo muestra u oculta botones).
- Historial: línea de tiempo con quién hizo qué y cuándo.
- **Terminado cuando:** hay pruebas unitarias de todas las transiciones válidas e inválidas, una prueba API de "tomar" concurrente (dos a la vez → uno 200 y otro 409), y el e2e: login → crear → verlo como admin → tomar → responder → cerrar → correo en la cola.

### Fase 6 — Correos
- Trabajador de la cola: toma lotes con `FOR UPDATE SKIP LOCKED`, reintentos progresivos (1 min, 5 min, 15 min, 1 h, 6 h, 24 h) y marca el correo como FALLIDO al agotar intentos.
- Transportes Graph, SMTP y consola, intercambiables con `MAIL_TRANSPORT`.
- Plantillas en BD con variables `{{folio}}`, etc. (con escape de HTML), editor de plantillas con vista previa y lista de variables disponibles.
- Ajuste "enviar correo en respuestas intermedias" (apagado por defecto).
- Pantalla de la cola: pendientes, enviados, fallidos y botón "reintentar".
- `docs/CORREO_M365.md`: qué pedirle al administrador de Microsoft 365.
- **Terminado cuando:** hay pruebas de que un transporte que falla no rompe la creación del ticket, del cálculo de reintentos y de la plantilla con variables maliciosas (se escapan); en modo consola el `.eml` queda en disco.

### Fase 7 — Robustez
- Respaldos: `mysqldump --single-transaction` + copia de `storage/adjuntos`, retención configurable, versiones `.sh` y `.ps1`, y una **restauración probada** en una BD limpia.
- Revisión de seguridad (OWASP ASVS nivel 1 como guía), `helmet` con CSP estricta, límites de tamaño en todas las peticiones, redacción de datos sensibles en los logs.
- Prueba de carga básica con 20,000 tickets sembrados: bandeja y búsqueda por debajo de 300 ms en p95 en un equipo de desarrollo.
- Revisión de estados de carga, error y vacío en cada pantalla; la web no se rompe con la API caída.
- **Terminado cuando:** el script de respaldo y restauración se ejecutó de principio a fin y está documentado, la suite completa está en verde y hay un informe breve de seguridad en `DECISIONES.md`.

### Fase 8 — Documentación y despliegue
- `README.md`, `docs/EXTENDER.md`, `docs/DESPLIEGUE.md` (según el sistema operativo confirmado), `CHECKLIST_QA.md`, `CHANGELOG.md`.
- **Terminado cuando:** se hizo una instalación desde cero siguiendo solo el README, en una carpeta nueva, y funciona.

### Fase opcional — Editor de permisos por rol
Pantalla para crear roles (por ejemplo "Consulta") y marcar sus permisos. Las tablas existen desde la fase 1, así que esta fase solo agrega la pantalla.

## 4. Riesgos que ya veo

| Riesgo | Mitigación |
|---|---|
| Permisos de Microsoft 365 tardan en aprobarse | El transporte "consola" permite terminar y probar todo sin credenciales; Graph se conecta al final. |
| Importar 2,566+ tickets del sistema actual | El modelo trae `origen` y `id_anterior`; la importación queda como fase aparte y necesita acceso a la BD vieja. |
| Cambiar el código de un departamento después de usarlo | El contador se lleva por código + año; los folios viejos no cambian y no puede haber choques (`UNIQUE` en `tickets.folio`). |
| Servidor Windows sin Docker | Se documentan las dos rutas: Node como servicio de Windows y MySQL nativo. |
