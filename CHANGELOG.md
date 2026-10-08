# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Cambiado
- **Folio sin año:** `VEN-0001`, con un consecutivo por departamento que nunca se reinicia (migración `0004`). Los tickets anteriores conservan su folio (`SIS-2026-0007`) y el siguiente de cada departamento continúa en su número (`SIS-0008`).
- **Base de datos: de MySQL 8.4 a PostgreSQL 17**, para desplegar en Render.
  - Una sola variable de conexión, `DATABASE_URL` (reemplaza `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`).
  - Las migraciones de MySQL quedaron reunidas en una sola migración base. Se mantiene que usuario, correo y búsquedas no distingan mayúsculas ni acentos.
  - La búsqueda libre usa el texto completo de PostgreSQL. Ahora pasan las 3 pruebas de búsqueda que fallaban con el FULLTEXT de MySQL.
  - `npm run db:local` levanta un PostgreSQL portátil que viene con `npm install`; ya no se descarga MySQL.
  - Respaldo y restauración sin programas externos: funcionan igual contra la base local que contra una remota (`--url`). Los respaldos anteriores de MySQL no se pueden cargar.
- **Solo los admins cambian su propia contraseña.** A los demás se la cambia un admin desde Usuarios, y ya no se les pide cambiarla al entrar.

### Agregado
- **Animaciones de la apariencia:** partículas en el fondo, detrás del contenido, según la paleta (cempasúchil, nieve, confeti tricolor y corazones en las de temporada; burbujas, hojas, luciérnagas, estrellas, pétalos… en las normales); el tema nuevo se abre en círculo desde el clic al cambiar de color o modo; los adornos de temporada se mueven (papel picado que se mece, luces que parpadean, corazones que laten); los avatares hacen un gesto al pasar el mouse y un "pop" al elegirlos; un brillo suave recorre la barra lateral. Se apagan con el interruptor "Animaciones" de Apariencia o con "reducir movimiento" del equipo.
- **Avatar (beta):** en Apariencia cada usuario puede elegir uno de 16 dibujos (gato, zorro, robot, cohete…) en lugar de sus iniciales. Toma los colores de su paleta y se guarda con su apariencia (sin cambios en la base). Lo ven también los demás: en las tarjetas de tickets (solicitante y técnico), en el detalle, en la conversación y en la lista de usuarios.
- **Departamentos de Aramo:** Ventas, Compras, Contabilidad, Facturación, Almacén PT, Almacén materiales, Producción y Calidad, además de Sistemas; Recursos Humanos se reactiva. Quien tiene un departamento asignado crea siempre con ese (lo ve fijo, sin lista; el servidor también lo impone); quien no tiene, lo elige; soporte elige cualquiera. El departamento aparece también en las tarjetas de la lista y del Kanban.
- **Los avisos de ticket nuevo y de ticket cerrado llegan a todos los admins activos**, incluido quien creó o cerró el ticket. Los correos de Ajustes → Correos ahora son extra y pueden quedar vacíos; ya no hace falta agregar ahí a cada admin nuevo.
- **Respuestas guardadas** (botón "Respuestas" en la barra al responder un ticket): cada técnico guarda sus propios textos y los inserta con un clic; también puede guardar lo que acaba de escribir. Solo él las ve; sin imágenes; hasta 50 por persona (migración `0003`).
- **Temas de temporada automáticos:** quien usa Aqua ve sola la paleta de Navidad (1 dic – 6 ene), San Valentín (7 – 15 feb), Fiestas patrias (septiembre) o Día de Muertos (25 oct – 3 nov), y después vuelve a Aqua. Se puede apagar en Apariencia, y cualquiera puede elegir una de temporada a mano. Cada una lleva su adorno en la barra lateral (luces, corazones, papel picado).
- **Pantallas vacías ilustradas:** dibujos con los colores de tu paleta y textos más amables (sin tickets, sin resultados, página que no existe, sin acceso, sin conexión, etc.).
- **Apariencia por usuario** (botón de paleta junto a tu nombre): modo Automático, Claro u Oscuro y diez paletas de color (Aqua, Océano, Bosque, Ámbar, Ciruela, Coral, Grafito, Rosa y Vino) más una de temporada, Día de Muertos (cempasúchil y rosa mexicano, barra lateral morada con papel picado), con vista previa en miniatura. Se guarda en el usuario y se aplica en cualquier equipo; los colores de estatus, urgencia y gráficas no cambian.
- Aplicación instalable (PWA) y guía de despliegue en Render y en PC de oficina.
- Aviso de ticket nuevo a varios correos, con la urgencia en el asunto; "Enviar copia a" acepta varios correos y no deja pasar uno mal escrito.

## [0.4.1] — 2026-09-30

### Agregado
- **Menú lateral colapsable con animación.**
  - En pantalla ancha, la flecha del borde lo contrae a una barra de solo íconos y lo vuelve a expandir. Al pasar el cursor, cada ícono muestra su nombre, y el navegador recuerda la elección.
  - En pantallas angostas y celular, el botón de tres rayas despliega y oculta el menú, que se cierra solo al elegir una opción.
  - Sin animación para quien la tenga desactivada en su sistema (`prefers-reduced-motion`).
- Comando `npm run tunel`: publica el sistema de la PC con un enlace https temporal para pruebas de QA.
- Pruebas en navegador del menú (pantalla ancha y celular).

## [0.4.0] — 2026-09-30

### Agregado
- **Urgencia** del ticket: `baja` (verde `#22c55e`), `media` (amarillo `#eab308`), `alta` (naranja `#f97316`) y `crítica` (rojo `#ef4444`).
  - Se elige en "Nuevo ticket"; por omisión es "media".
  - Se ve como distintivo y franja de color en la lista, el Kanban, el detalle y la tabla del dashboard.
  - La bandeja y el dashboard se pueden ordenar por urgencia (crítica arriba) y filtrar por ella.
- **Dashboard** (`/panel`, solo admins): los admins entran directo aquí.
  - Tarjetas: abiertos, en proceso, cerrados hoy, cerrados esta semana, críticos y altos sin atender. Las de urgencia filtran la tabla con un clic.
  - Gráficas de abiertos por urgencia y por departamento. Un clic en una barra filtra la tabla.
  - Tabla con filtros por estado, urgencia, departamento y fechas, más el orden.
  - Se refresca cada 30 s.
  - El acceso se verifica en el servidor con el permiso `panel.ver`: un solicitante recibe 403 aunque conozca la ruta.
- **Notificaciones dentro del sistema**: campana con contador de no leídas y panel con las recientes y enlace directo al ticket. Se actualiza cada 20 s.
  - Un ticket nuevo avisa a cada admin.
  - Respuestas y cambios de soporte (tomado, pausado, reanudado, reasignado, cerrado) avisan al solicitante.
  - Se puede marcar una o todas como leídas. Cada quien solo ve y marca las suyas.
  - Reglas por rol: el admin ve solo los `nuevo_ticket` y el usuario solo los `ticket_contestado` de sus tickets. Un admin que también reporta ve ambos, y nadie recibe aviso de sus propios cambios.
- Migración `0004`: columna `urgencia`, tabla `notificaciones` y permiso `panel.ver` para el rol de administración existente.
- Pruebas: 15 de API nuevas (urgencia, dashboard, notificaciones y endpoints nuevos en la matriz de permisos) y 2 recorridos en navegador.

### Notas de diseño
- Los colores de urgencia de la especificación no se distinguen solos: naranja y rojo se parecen, y verde y amarillo se confunden con daltonismo (validado con el script de la guía de gráficas). Por eso la urgencia **siempre** se muestra con su nombre y un indicador de nivel de 1 a 4 barras, y el texto va en tinta, no en el color.

## [0.3.0] — 2026-09-29

### Cambiado
- **Folio nuevo `DEPTO-AÑO-CONSECUTIVO`** (`SIS-2026-0001`, `RH-2026-0001`), según la especificación. El consecutivo es de 4 dígitos y se reinicia en 0001 cada 1 de enero, por departamento. Se genera en una sola sentencia atómica y el año se toma en la hora de México. Los tickets anteriores conservan su folio.
- El asunto de todos los correos de tickets empieza con `[folio]`. El sistema lo garantiza aunque se edite la plantilla, y no deja guardar una plantilla de ticket sin `{{folio}}`.
- Los códigos de empresa y tipo ya no forman el folio (quedan como códigos cortos).

### Agregado
- Catálogo **Departamentos** (Catálogos → Departamentos), con los iniciales SIS y RH. Migración `0003`.
- Campo **Departamento** en el usuario (se propone al crear sus tickets), en "Nuevo ticket", en el detalle, en la lista de usuarios y como filtro de la bandeja.
- Pruebas: formato, reinicio anual, contador por departamento y año, año en zona horaria, 50 creaciones simultáneas, departamento desactivado, catálogo de departamentos y folio en el asunto.

### Corregido
- Al pasar entre Lista y Kanban se cierra el ticket abierto; el botón de cerrar sesión ya no se corta; `/health` reporta la versión real.

## [0.2.0] — 2026-09-29

Pruebas automatizadas completas y preparación para uso en toda la empresa.

### Agregado
- **Pruebas**: 228 automatizadas, todas en verde: 51 unitarias (25 en shared y 26 en la API), 172 de API con Supertest y 5 recorridos en navegador con Playwright. Prueba de carga con 20,000 tickets (`npm run carga -w @mesa/api`).
- **Cambio de contraseña obligatorio** cuando el admin la asigna o la restablece (migración `0002`), y botón para que cada usuario cambie la suya (cierra sus otras sesiones).
- `docs/SEGURIDAD.md`: controles, riesgos aceptados y lista obligatoria antes de publicar.
- Registro de accesos a la API en producción (usuario, ruta, estatus, duración e IP; sin datos sensibles).
- Cabeceras `Permissions-Policy`, `X-Robots-Tag` y `robots.txt` para que ningún buscador indexe el sistema.
- `npm run ci` incluye `npm audit` de dependencias de producción y, con `--e2e`, los recorridos en navegador.

### Cambiado
- **Rendimiento** con muchos tickets: los contadores y la paginación se calculan solo sobre `tickets` (las uniones se hacen solo para la página visible) y la búsqueda de texto usa el índice FULLTEXT. Con 20,000 tickets, la bandeja bajó de 329 a 40 ms y el Kanban de 658 a 40 ms (p95).
- Cookie de sesión con prefijo `__Host-` cuando hay HTTPS.
- En producción, `APP_URL` debe ser `https://`.
- El inicio de sesión ya no dice cuántos intentos quedan: no revela qué usuarios existen.
- La web se publica sin *source maps* y con las librerías en archivos aparte, que el navegador conserva en caché.

### Corregido
- Si alguien escribía en la búsqueda y abría un ticket de inmediato, la búsqueda (aplicada con retraso) cerraba el ticket recién abierto. Lo detectó la prueba en navegador.
- Las subidas interrumpidas se quedaban en `storage/tmp`; ahora se limpian solas.
- `?volver=/\sitio.com` podía llevar a otro dominio después de iniciar sesión.
- La búsqueda de texto se cortaba en 5,000 coincidencias sin filtrar primero por visibilidad: con muchos tickets, un solicitante podía no encontrar los suyos.

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
