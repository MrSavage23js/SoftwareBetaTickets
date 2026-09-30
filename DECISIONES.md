# DECISIONES — Mesa de Ayuda

Registro de supuestos, decisiones y preguntas abiertas.
Convención: **`CONFIRMAR`** = necesito tu respuesta · **`SUPUESTO`** = lo asumí; avísame si está mal · **`DECIDIDO`** = decisión técnica mía, con su motivo.

---

## A. Hallazgos al revisar los archivos

1. **Faltan archivos de referencia.** No existen `CLAUDE.md` ni `referencia/estilos-tickets.css`, y la maqueta está en la raíz del proyecto, no en `referencia/`. Tomo como fuente de estilos el CSS que viene dentro de `maqueta-tickets.html`. → **`CONFIRMAR` P0**: ¿me pasas `CLAUDE.md`? Si trae reglas distintas a este plan, lo ajusto antes de la fase 0.
2. **Capturas del sistema actual** (11 PNG). De ellas saqué lo siguiente:
   - Folios reales: `ASCA-0063` (Autotransportes **As**turcones + **Ca**ncelación), `MACE-0046` (**Ma**quila Aramo + **C**ambio de **E**structura), `VPCO-0170` (**V**eladoras y **P**roductos Aramo + **Co**rrección). Deduzco el formato `EE` + `TT` + `-` + consecutivo de 4 dígitos. Ver P1.
   - Hay tickets con el módulo **"Gestión de Manufactura"**, que no está en la lista de módulos que me diste. Ver P10.
   - El sistema actual ya tiene **2,566 tickets** y **36 usuarios**. Ver P6.
   - Roles numéricos **1** y **2** (el usuario #1 tiene rol 1). Asumo 1 = admin soporte y 2 = usuario. Ver P11.
   - Fallas que **no** repetiremos: usuarios "En línea" cuyo último acceso fue hace un año (el estatus debe salir de las sesiones vivas), fechas `0000-00-00 00:00:00` (se mostrará "Nunca"), una casilla de empresa vacía al principio de la lista y fechas mezcladas en inglés y español ("Monday, 28 de September").
   - En la vista de ticket del sistema actual no aparece la empresa en el detalle; en la maqueta sí, así que sigo la maqueta.

## B. Decisiones técnicas (DECIDIDO)

| # | Decisión | Motivo |
|---|---|---|
| D1 | TypeScript + Node 24 LTS + Express 5 + React 19/Vite, en un monorepo. | Ver `PLAN.md` §1. |
| D2 | MySQL 8.4, `utf8mb4_0900_ai_ci`. | Búsquedas sin distinguir mayúsculas ni acentos ("nomina" encuentra "Nómina"). |
| D3 | Kysely en lugar de un ORM como Prisma. | Control fino de bloqueos (folio, tomar ticket, cola de correo) y de índices. |
| D4 | Fechas guardadas en UTC (`DATETIME(3)`) y mostradas en la zona de `APP_TZ`. | Evita errores con el horario de verano y al cambiar de servidor. |
| D5 | Sesión: token aleatorio de 32 bytes en una cookie `httpOnly; Secure; SameSite=Strict`; en la BD solo se guarda su hash SHA-256. | Si alguien roba la BD, no puede usar las sesiones. |
| D6 | "En línea" = tiene al menos una sesión sin cerrar y cuya última actividad no pasa del tiempo de inactividad. | Corrige la falla del sistema actual. |
| D7 | La inactividad cuenta solo la **actividad del usuario** (clics y teclas). La pantalla avisa al servidor como máximo 1 vez por minuto y solo si hubo actividad. Tener la pestaña abierta sin usarla **no** mantiene la sesión viva. | Para que el cierre por inactividad funcione de verdad. |
| D8 | CSRF con token sincronizado guardado en la sesión, además de `SameSite=Strict`. | Doble defensa. |
| D9 | Si un usuario pide un ticket que no le pertenece, recibe **404**, no 403. | No revela que ese folio existe. |
| D10 | El folio usa un contador por **prefijo de texto** (`ASCA`), incrementado con `INSERT … ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)` dentro de la transacción del ticket. Además hay `UNIQUE` en `tickets.folio` como red de seguridad. | Es atómico en MySQL y sigue funcionando aunque se cambie el código de una empresa. |
| D11 | "Tomar" es un `UPDATE … WHERE estatus='PENDIENTE' AND asignado_a_id IS NULL`: si no afecta ninguna fila, responde 409 "Otro técnico ya tomó este ticket". Las demás acciones usan una columna `version` (bloqueo optimista). | Evita que dos técnicos tomen el mismo ticket. |
| D12 | HTML del editor: lista blanca en el servidor (`p, br, strong, em, u, s, ol, ul, li, a[href], span[style=color]`, `img[src]` solo apuntando a adjuntos propios del sistema). Se eliminan `data:`, `javascript:` y todos los atributos `on*`. Los enlaces se fuerzan a `rel="noopener noreferrer" target="_blank"`. | Evita XSS. |
| D13 | Las imágenes pegadas o insertadas en el editor se suben como adjunto y el HTML las referencia por URL. Nunca se guardan en base64 dentro del HTML. | La BD no crece de más y la imagen queda protegida por permisos. |
| D14 | Los adjuntos se guardan en `storage/adjuntos/AAAA/MM/<uuid>` (fuera de la carpeta pública). El tipo se verifica por **contenido** (magic bytes), no solo por la extensión. Se descargan con `Content-Disposition: attachment`, salvo imágenes y PDF, que se muestran en línea con `X-Content-Type-Options: nosniff`. | Seguridad. |
| D15 | La cola de correo guarda el correo **ya armado** (asunto y cuerpo finales) al encolarlo. | Si después se edita una plantilla, no cambian los correos que ya estaban pendientes. |
| D16 | Configuración repartida así: `.env` = infraestructura y secretos (BD, puertos, correo, URL, techo de tamaño de archivos); tabla `ajustes` = reglas del negocio editables desde la pantalla (inactividad, intentos de login, tipos y tamaño de adjuntos por debajo del techo, correos intermedios). `.env` define los valores iniciales de los ajustes. | Cumple "desde la interfaz o `.env`" sin que choquen. |
| D17 | Estatus en una tabla catálogo (`estatus_ticket`). Las **transiciones** están en código (`packages/shared/maquina-estados.ts`), con pruebas. | Un estatus nuevo implica reglas nuevas, y eso debe pasar por una prueba (ver `EXTENDER.md`). |
| D18 | Borrar un usuario es una baja lógica (`eliminado_at`): cierra sus sesiones, conserva sus tickets y **su nombre de usuario no se puede reutilizar**. | Mantiene claro el historial. |
| D19 | La paginación de la bandeja usa desplazamiento (`LIMIT/OFFSET`) con índices compuestos; Kanban pagina por columna. | Con decenas de miles de tickets basta; si algún día se necesita, se cambia a paginación por cursor sin tocar la pantalla. |
| D20 | Búsqueda: folio con `LIKE 'texto%'` (usa el índice); concepto, folio(s) y descripción con `FULLTEXT`; solicitante y empresa por nombre con `JOIN`. | Rápida con miles de tickets. |
| D21 | El historial de tickets (`ticket_eventos`) y la auditoría general (`auditoria`) guardan eventos genéricos con `tipo` + `datos JSON`. | Sirve después para reportes y notificaciones sin cambiar el esquema. |
| D22 | La importación del sistema anterior queda **prevista, no construida**: columnas `origen` e `id_anterior` en usuarios y tickets, y una carpeta `modulos/importacion/` con su README y la interfaz a implementar. | Lo pide el prompt. |

## C. Supuestos (SUPUESTO — corrígeme si alguno está mal)

- **S1.** Solo hay dos roles al inicio: **Usuario** (solicitante) y **Admin soporte**, que atiende tickets y además administra usuarios, catálogos y plantillas. Los permisos están separados por tabla, así que después se puede crear "Técnico" sin acceso a Usuarios, o "Consulta".
- **S2.** Barra de avance: **Creado** (al crearse) → **Tomado** (al asignarse) → **En proceso** (con la primera respuesta de soporte) → **Cerrado** (Completado). En la maqueta, al tomar el ticket se marcan a la vez los pasos 2 y 3; si prefieres eso, es un cambio de una línea. → ver P13.
- **S3.** Estatus: `PENDIENTE`, `EN_PROCESO`, `PAUSADO`, `COMPLETADO`. Transiciones:
  - PENDIENTE → EN_PROCESO (tomar)
  - EN_PROCESO → PAUSADO (pausar, con motivo obligatorio)
  - PAUSADO → EN_PROCESO (reanudar)
  - EN_PROCESO | PAUSADO → mismo estatus con otro técnico (reasignar)
  - EN_PROCESO | PAUSADO → COMPLETADO (cerrar, con resolución obligatoria)
  - COMPLETADO → EN_PROCESO (reabrir) *solo si se confirma P4*
- **S4.** Responder, pausar, reanudar y cerrar los puede hacer **solo el técnico asignado**. Reasignar lo puede hacer el asignado o cualquier admin soporte. Un ticket PENDIENTE no se puede responder (como dice la maqueta: "Toma el ticket para poder responder").
- **S5.** El solicitante puede comentar y adjuntar en PENDIENTE, EN_PROCESO y PAUSADO. En COMPLETADO todo queda en solo lectura.
- **S6.** El admin soporte también puede crear tickets (el botón aparece en la maqueta). Lo hace a su nombre o **en nombre de un usuario**; en ese caso se guarda `creado_por_id` aparte del solicitante. → ver P12.
- **S7.** Módulo, concepto y folio(s) son obligatorios o no **según el tipo de solicitud** (se configura en el catálogo). Valores iniciales: todos obligatorios, excepto en "Mantenimiento a equipo o instalación" y "Consulta General", donde módulo y folio(s) son opcionales. → ver P14.
- **S8.** Adjuntos: hasta 5 archivos por mensaje, 10 MB cada uno. Tipos: pdf, png, jpg, jpeg, gif, webp, doc(x), xls(x), csv, txt, xml, zip. Todo es configurable.
- **S9.** Contraseñas: mínimo 8 caracteres, con al menos una letra y un número. 5 intentos fallidos bloquean la cuenta 15 minutos. Inactividad: 30 minutos. Duración máxima de una sesión: 12 horas. Todo es configurable.
- **S10.** No hay recuperación de contraseña por correo: la restablece el admin (como dice la maqueta: "Solicítalo al administrador"). Puedo agregar la opción de "debe cambiarla en el siguiente inicio" si la quieres.
- **S11.** La interfaz está solo en español (es-MX), con fechas como "lunes, 28 de septiembre de 2026".
- **S12.** Zona horaria `America/Mexico_City`. → ver P15.
- **S13.** Kanban: la columna Completado muestra los más recientes primero (máximo 50 y "Ver más"), sin límite de fecha.
- **S14.** Un admin no ve la lista de "Mis tickets"; su pantalla principal es la Bandeja. Si el admin crea tickets a su nombre, los encuentra con el filtro "Solicitante".
- **S15.** La numeración de folios arranca en 0001 por prefijo, salvo que se importe el historial (P6); en ese caso cada prefijo sigue desde el último número importado.

## D. Preguntas — `CONFIRMAR`

**Las que el prompt pide contestar antes de la fase 1:**

- ~~**P1 · Formato del folio.**~~ **RESUELTA el 29/09/2026** con la especificación del usuario: `DEPTO-AÑO-CONSECUTIVO` (ver D32). Lo que sigue queda solo como historial:
  - **P1 · Formato del folio (texto original).** Mi deducción es `[código empresa, 2 letras][código tipo, 2 letras]-[consecutivo de 4 dígitos]`, con el consecutivo **por combinación empresa + tipo** (`MACE-0045`, `MACE-0046`).
  - ¿Es correcto? ¿O el consecutivo es por empresa, o uno solo global?
  - ¿Qué pasa al llegar a 9999? Propongo que crezca a 5 dígitos (`ASCA-10000`).
  - Necesito la **tabla completa de códigos**. Propuesta para que la corrijas:

  | Empresa | Código | | Tipo | Código |
  |---|---|---|---|---|
  | Aram_Wax | AW? | | Corrección | CO ✔ |
  | Aramo de la Frontera | AF? | | Cancelación | CA ✔ |
  | Autotransportes Asturcones | AS ✔ | | Alta en catálogo | AC? |
  | Cedis | CD? | | Cambio de estructura | CE ✔ |
  | Distribuidora de Productos Aramo | DP? | | Consulta General | CG? |
  | Distribuidora Jarchi | DJ? | | Mantenimiento a equipo o instalación | MT? |
  | Etiquetas Aramo | EA? | | | |
  | Luz de Vida | LV? | | | |
  | Maquila Aramo | MA ✔ | | | |
  | Maquila Aramo DPA | MD? | | | |
  | Maquila Atenco | MN? | | | |
  | Maquila Los Reyes DPA | MR? | | | |
  | Planta Aramo | PA? | | | |
  | Productos Aramo S | PS? | | | |
  | Veladoras Renacimiento | VR? | | | |
  | Veladoras y Productos Aramo | VP ✔ | | | |
  | Vilaflor | VF? | | | |

  ✔ = sale de un folio real · ? = lo inventé. Los códigos deben ser únicos dentro de su catálogo; si los dos siempre tienen 2 letras, un prefijo nunca se puede leer de dos formas.
- **P2 · Lista completa de empresas.** Falta al menos una entre "Cedis" y "Distribuidora de Productos Aramo". ¿Cuál es la lista completa? ¿"Empresa / Sucursal" significa que algunas entradas son sucursales de otra empresa (y hace falta una jerarquía), o es una lista plana?
- **P3 · "Enviar copia a".** ¿Solo usuarios del sistema, o también correos libres? El modelo acepta las dos cosas; si son solo usuarios, se elige de una lista. ¿Las personas en copia pueden **ver** el ticket en el sistema, o solo reciben el correo? ¿Reciben también el correo de cierre?
- **P4 · Reabrir.** ¿Un ticket Completado se puede reabrir? ¿Quién: el solicitante, cualquier admin o solo el técnico que lo cerró? ¿Hay un plazo (por ejemplo, 7 días)?
- **P5 · Visibilidad.** ¿El usuario ve solo sus tickets o todos los de sus empresas asignadas? (Está preparado con el permiso `tickets.ver_empresa`.)
- **P6 · Historial anterior.** ¿Se importan los 2,566 tickets y 36 usuarios, o se empieza de cero? Si se importan: ¿en qué BD está el sistema actual y me pueden dar un respaldo o el esquema? (Por ahora solo lo dejo previsto.)
- **P7 · Correo.** ¿Microsoft Graph o SMTP (Office 365 con `smtp.office365.com:587`)? ¿Quién administra Microsoft 365? ¿Desde qué buzón salen los correos (por ejemplo `mesadeayuda@…`)? Lo que hay que pedirle al administrador quedará en `docs/CORREO_M365.md`. Resumen para Graph: registrar una aplicación en Entra ID, darle el permiso de aplicación `Mail.Send` con consentimiento de administrador, **limitarla a un solo buzón** con una *Application Access Policy* y entregar `TENANT_ID`, `CLIENT_ID` y `CLIENT_SECRET` (o un certificado).
- **P8 · Servidor.** ¿Qué sistema operativo tendrá (Windows Server o Linux)? ¿Tiene Docker? ¿Ya hay MySQL, MariaDB o SQL Server instalado? ¿Dónde va a vivir (servidor local de la empresa o en la nube)? ¿Habrá HTTPS con un certificado de la empresa? ¿Se accede solo desde la red interna o también desde fuera? Esto último importa para el botón "Ver ticket en el sistema" del correo.

**Otras que surgieron al revisar:**

- **P9 · Aviso a soporte.** ¿Soporte debe recibir un correo cuando se crea un ticket nuevo (a un buzón de grupo o a todos los admins)? El prompt no lo menciona; lo dejaría apagado y configurable.
- **P10 · Módulo "Gestión de Manufactura".** Aparece en tickets reales pero no en tu lista. ¿Lo agrego? ¿Faltan otros módulos?
- **P11 · Roles del sistema actual.** ¿Existe algún rol además de 1 (admin) y 2 (usuario)? ¿Todos los admins atienden tickets, o alguno solo administra?
- **P12 · Tickets a nombre de otro.** ¿El admin puede crear tickets en nombre de un usuario (por ejemplo, cuando le llaman por teléfono)?
- **P13 · Barra de avance.** ¿"En proceso" se marca al tomar el ticket (como en la maqueta) o con la primera respuesta de soporte (mi propuesta S2)?
- **P14 · Campos obligatorios por tipo.** ¿"Mantenimiento a equipo o instalación" necesita módulo y folio(s)? (Ver S7.)
- **P15 · Zona horaria.** ¿Todo en `America/Mexico_City`? (Pregunto porque "Aramo de la Frontera" podría estar en otra zona.)
- **P16 · Cancelar.** ¿El solicitante puede cancelar su propio ticket mientras está Pendiente? Hoy no existe ese estatus.
- **P17 · Marca.** ¿El texto "[Nombre de la empresa]" en la pantalla de inicio es "Grupo Aramo"? ¿Hay un logo en SVG o PNG?
- **P18 · Nombre para mostrar.** Hoy el nombre de usuario (`Laura_Mendez`) se usa también como nombre visible. ¿Agrego un campo "Nombre completo" para mostrar y para los correos, o se queda solo el usuario?

---

## E. Estado de la implementación (29/09/2026)

El usuario pidió continuar sin contestar las preguntas y **sin pruebas automatizadas por ahora**. Lo que se hizo en consecuencia:

**Respuestas provisionales aplicadas.** Todas se cambian en pantalla, en un ajuste o en un permiso, sin reescribir nada:

| Pregunta | Cómo quedó | Dónde se cambia |
|---|---|---|
| P1 códigos de folio | **Reemplazada por D32** (folio por departamento). Texto anterior: | 3 empresas con código confirmado por folios reales (AS, MA, VP); las otras 14 con códigos **PROVISIONALES**; tipos CO, CA, CE confirmados, y AC, CG, MT provisionales. Consecutivo por prefijo empresa+tipo. | Catálogos |
| P2 empresas | Las 17 de la lista, en lista plana. | Catálogos → Agregar |
| P3 copias | Se aceptan usuarios del sistema **y** correos libres. Las copias reciben el correo de creación; **no** pueden ver el ticket en el sistema. | — |
| P4 reabrir | Implementado, pero **nadie tiene el permiso** `tickets.reabrir`. | Migración o permiso |
| P5 visibilidad | Cada usuario ve **solo sus tickets**. `tickets.ver_empresa` ya existe y funciona si se asigna. | Permiso |
| P6 historial | Empezar de cero; la importación queda prevista (`modulos/importacion/README.md`). | — |
| P7 correo | `MAIL_TRANSPORT=consola` hasta tener credenciales. | `.env` |
| P9 aviso a soporte | Implementado y apagado. | Ajustes |
| P12 a nombre de otro | Sí, para Admin soporte. | Permiso |
| P13 barra de avance | "En proceso" se marca con la primera respuesta de soporte. | `pasosCompletados` |
| P14 campos por tipo | Módulo opcional en Consulta General y Mantenimiento; folio(s) obligatorio solo en Corrección y Cancelación. | Catálogos → Tipos |
| P18 nombre | Se agregó un campo opcional "Nombre completo"; si está vacío se muestra el nombre de usuario. | Usuarios |

**Decisiones técnicas nuevas:**
- **D23.** Puertos 3100 (API y web) y 5180 (Vite en desarrollo): en este equipo el 3000 y el 5173 los usa otro proyecto (`sistema-fichas-tecnicas`).
- **D24.** La pantalla de inicio de sesión vive en `/inicio`, como la llama la maqueta.
- **D25.** Se actualizaron nodemailer (10), kysely (0.29) y file-type (22) por seguridad y compatibilidad. TypeScript 7, ESLint 10, Vite 8 y React Router 8 se dejaron para después, por la compatibilidad de las herramientas.
- **D26.** Las fuentes (Figtree y Bricolage Grotesque) van incluidas en el sistema (`@fontsource`), no desde Google Fonts: funcionan sin internet y la CSP no permite orígenes externos.
- **D27.** `POST /auth/actividad` registra actividad sin límite de frecuencia. La web lo llama como máximo cada 30 s y solo si hubo actividad real.

**Decisiones de la versión 0.2.0 (pruebas y preparación para producción):**
- **D28.** Las pruebas usan la BD `DB_NAME_TEST` y carpetas `storage/pruebas` y `storage/e2e`. Se reinician con `DELETE` (no `TRUNCATE`, que en InnoDB tardaba 3 s por prueba). Los archivos de prueba corren uno tras otro porque comparten la BD.
- **D29.** Cambio de contraseña obligatorio (migración 0002). Mientras esté pendiente, la API solo permite `/auth/*`.
- **D30.** Listado en dos pasos: primero ids y contadores solo sobre `tickets`; luego uniones solo para los ids de la página. La búsqueda de texto se resuelve con FULLTEXT en una consulta aparte (hasta 5,000 coincidencias) y el `LIKE '%…%'` queda solo para textos de menos de 3 caracteres.
- **D31.** Medidas contra el descubrimiento de usuarios, cookie `__Host-`, `robots.txt` y `noindex`, web sin *source maps* y registro de accesos. Detalle y riesgos aceptados en `docs/SEGURIDAD.md`.

**Decisión de la versión 0.3.0 (folio por departamento, especificación del usuario del 29/09/2026):**
- **D32.** El folio es `[DEPTO]-[AÑO]-[CONSECUTIVO]`, p. ej. `SIS-2026-0001`:
  - `DEPTO` sale del catálogo `departamentos` (configurable en pantalla; se siembran SIS y RH).
  - `AÑO` es el año en curso en `APP_TZ`, no en UTC.
  - `CONSECUTIVO` tiene 4 dígitos y se reinicia cada 1 de enero por departamento, con la tabla `folio_contadores (departamento, anio, ultimo_consecutivo)` y una sola sentencia atómica (`INSERT … ON DUPLICATE KEY UPDATE`). `INSERT IGNORE` + `UPDATE` se descartó porque causaba interbloqueos: lo detectó la prueba de 50 creaciones simultáneas.
  - El departamento se elige en "Nuevo ticket", preseleccionado con el departamento del usuario (campo nuevo en Usuarios).
  - Los asuntos de correo empiezan con `[folio]`, y el sistema lo antepone si una plantilla editada no lo trae. Guardar una plantilla de ticket sin `{{folio}}` en el asunto da error.
  - Los tickets anteriores conservan su folio y quedaron en el departamento SIS.
  - Los códigos de empresa y tipo ya no forman el folio; quedan como códigos cortos para reportes. Por eso **P1 ya no bloquea** y los códigos provisionales de empresas dejan de importar para el folio.

**Decisiones de la versión 0.4.0 (dashboard, notificaciones y urgencia, especificación del usuario del 30/09/2026):**
- **D33.** Urgencia en `tickets.urgencia` (ENUM `BAJA`, `MEDIA`, `ALTA`, `CRITICA`, en ese orden para que `ORDER BY urgencia DESC` deje la crítica arriba), con los colores de la especificación. Como esos colores fallan la validación de daltonismo y de distinción normal, se acompañan siempre del nombre y de un indicador de nivel.
- **D34.** El dashboard es la ruta `/panel` con el permiso nuevo `panel.ver`, que solo tiene el rol de administración (la migración 0004 se lo da al rol existente). Las gráficas son barras en HTML, sin librería: la especificación sugería Chart.js o Recharts, pero no hace falta para dos gráficas de barras. Tienen valor en la punta, detalle al pasar el cursor o con el teclado y clic para filtrar.
- **D35.** Las notificaciones se insertan dentro de la transacción de la operación que las provoca. "Admins" son los usuarios con `tickets.atender`. "Contestado o actualizado" incluye respuestas y cambios de estatus de soporte. No se notifica a quien hizo el cambio. Se consulta cada 20 s: la especificación sugería de 15 a 30 s, y WebSockets quedan para después si hiciera falta inmediatez. Las leídas de más de 90 días se depuran solas. Reglas exactas (especificación del 30/09/2026): no hay otros casos. La campana además filtra al leer: `nuevo_ticket` solo le aparece a quien hoy es admin, y `ticket_contestado` solo si el ticket es suyo. Un admin que reporta tickets ve ambos tipos, y a quien le quitan el rol de admin se le dejan de mostrar los `nuevo_ticket`. "Quien creó el ticket" es el solicitante: si soporte registra un ticket a nombre de alguien, el aviso le llega a esa persona.

**Pendientes:**
- **Confirmar la lista de departamentos y sus códigos** (hoy: SIS = Sistemas / TI, RH = Recursos Humanos) y asignar el departamento a cada usuario.
- Fase opcional: pantalla para editar permisos por rol.
- Contestar las preguntas de §D.

## Bitácora de cambios a este documento
- 2026-09-28 — Versión inicial (propuesta previa a la fase 0).
- 2026-09-29 — §E: respuestas provisionales, decisiones D23–D27 y pendientes.
