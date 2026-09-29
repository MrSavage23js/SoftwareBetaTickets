# Cómo extender la Mesa de Ayuda

Regla general: **lo que es dato se cambia en pantalla; lo que es regla se cambia en código y con migración.** Después de cualquier cambio de código corre `npm run ci`.

## 1. Agregar un tipo de solicitud
En pantalla, sin código: **Catálogos → Tipos de solicitud → Agregar**.
- **Código** (2 a 4 letras o números, único): es la segunda parte del folio (`CO` → `ASCO-0001`).
- **Título de la sección**: el encabezado que aparece en "Nuevo ticket" ("Detalle de la corrección").
- **Campos obligatorios**: módulo, concepto y folio(s).

Para que el tipo exista también en instalaciones nuevas, agrégalo a `apps/api/src/db/seeds/datos-iniciales.ts` (`TIPOS`). El seed solo inserta lo que falta.

## 2. Agregar un módulo
**Catálogos → Módulos → Agregar.** El código es opcional y no forma parte del folio. Para instalaciones nuevas, agrégalo también a `MODULOS` en el mismo archivo de seeds.

## 3. Agregar una empresa
**Catálogos → Empresas → Agregar** con su código de folio (2 a 4 caracteres, único). Después asígnala a los usuarios en **Usuarios → Editar → Empresa / sucursal**.
- Nunca se borran: se **desactivan**. Los tickets viejos la siguen mostrando.
- Cambiar el código no modifica los folios emitidos: los tickets nuevos arrancan su propio consecutivo con el prefijo nuevo.

## 4. Agregar un campo nuevo al ticket (ejemplo: "Prioridad")
1. **Migración**: crea `apps/api/src/db/migraciones/0002_prioridad.ts`:
   ```ts
   import { sql, type Kysely } from 'kysely';
   export async function up(db: Kysely<unknown>) {
     await sql`ALTER TABLE tickets ADD COLUMN prioridad ENUM('BAJA','MEDIA','ALTA') NOT NULL DEFAULT 'MEDIA' AFTER folios_ref`.execute(db);
     await sql`CREATE INDEX ix_tickets_prioridad ON tickets (prioridad, creado_at)`.execute(db); // solo si se va a filtrar
   }
   export async function down(db: Kysely<unknown>) {
     await sql`ALTER TABLE tickets DROP COLUMN prioridad`.execute(db);
   }
   ```
   y regístrala en `apps/api/src/db/migrador.ts` (`'0002_prioridad': m0002`).
2. **Tipos de BD**: agrega `prioridad` a `TicketsTabla` en `apps/api/src/db/tipos.ts`.
3. **Validación**: agrégalo a `esquemaTicketCrear` (y a `esquemaListarTickets` si se filtra) en `packages/shared/src/esquemas.ts`.
4. **Respuesta**: agrégalo a `TicketResumen`/`TicketDetalle` en `packages/shared/src/tipos.ts` y a las consultas de `apps/api/src/modulos/tickets/consultas.ts`.
5. **Guardado**: en `crearTicket` (`operaciones.ts`) agrega el campo al `insertInto('tickets')`.
6. **Pantalla**: el campo en `NuevoTicket.tsx`, una `Celda` en `Detalle.tsx` y, si se filtra, un `select` en `PanelFiltros` (`Tickets.tsx`).
7. **Correo** (opcional): agrega la variable en `variablesTicket` (`operaciones.ts`) y en la lista `variables` de la plantilla (seed o migración).

La migración corre sola al iniciar el servicio. Haz un respaldo antes de desplegar.

## 5. Agregar un estatus nuevo (ejemplo: "En espera de proveedor")
El estatus afecta las reglas, así que se hace en código:
1. `packages/shared/src/estatus.ts`: agrégalo a `ESTATUS`, `LISTA_ESTATUS` e `INFO_ESTATUS` (nombre, plural y clase de color).
2. `packages/shared/src/maquina-estados.ts`: define **desde dónde se llega y a dónde se puede ir**. Por ejemplo, una acción nueva `esperarProveedor` con `desde: [EN_PROCESO]` y `hacia: 'ESPERA_PROVEEDOR'`, y agrega el estatus nuevo al `desde` de `reanudar`, `cerrar` y `responder` si aplica.
3. **Migración** que inserte la fila en `estatus_ticket` (el seed también lo hace en instalaciones nuevas).
4. Si hay acción nueva: una ruta en `tickets/rutas.ts`, una función en `operaciones.ts` (usa `conTicket` como las demás) y un botón en `Detalle.tsx`.
5. Estilo del color: agrega `.pill.<clase>` en `apps/web/src/estilos/app.css` y el color de la columna en `Kanban.tsx`.
6. `pasosCompletados` (estatus.ts) si cambia la barra de avance.
7. Prueba unitaria de la máquina de estados para la transición nueva.

## 6. Agregar un rol nuevo (ejemplo: "Consulta", solo lectura de todos los tickets)
Los permisos viven en BD (`roles`, `permisos`, `rol_permisos`), así que basta una migración:
```ts
export async function up(db: Kysely<unknown>) {
  await sql`INSERT INTO roles (codigo, nombre, descripcion, es_sistema) VALUES ('CONSULTA','Consulta','Ve todos los tickets, no modifica',0)`.execute(db);
  await sql`INSERT INTO rol_permisos (rol_id, permiso_id)
            SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN ('tickets.ver_propios','tickets.ver_todos','tickets.ver_historial')
            WHERE r.codigo = 'CONSULTA'`.execute(db);
}
```
El menú, los botones y el servidor se ajustan solos porque todo revisa **permisos**, nunca el nombre del rol. El rol aparece de inmediato en Usuarios → Rol.
- **Permiso nuevo**: agrégalo a `PERMISOS` y `DESCRIPCION_PERMISOS` en `packages/shared/src/permisos.ts` (el seed lo inserta en `permisos`) y asígnalo con una migración a los roles existentes. El seed no modifica los permisos de roles que ya existen.
- La pantalla para editar permisos es la fase opcional del plan; las tablas ya están listas.

## 7. Agregar una plantilla de correo nueva (ejemplo: aviso al pausar)
1. **Plantilla**: agrégala a `apps/api/src/db/seeds/plantillas-iniciales.ts` con `codigo`, `asunto`, `cuerpoHtml` y la lista de `variables`. Para instalaciones existentes, crea además una migración con el `INSERT`.
2. **Código**: agrega el código a `CODIGOS_PLANTILLA` (`modulos/correos/cola.ts`).
3. **Encolar**: en la operación correspondiente (por ejemplo `pausar` en `operaciones.ts`) y **dentro de la transacción**:
   ```ts
   const { vars, solicitante } = await variablesTicket(c.tx, id);
   await encolarCorreo(c.tx, { plantilla: CODIGOS_PLANTILLA.TICKET_PAUSADO, para: [solicitante], variables: { ...vars, motivo: d.motivo }, ticketId: id });
   ```
4. Si debe poder apagarse, agrega un ajuste booleano en `packages/shared/src/ajustes.ts` (y su valor inicial en `valoresInicialesAjustes`) y revísalo antes de encolar.
5. El texto se edita después en pantalla: **Correos → Plantillas**.
   - `{{variable}}` inserta texto escapado.
   - `{{{variable_html}}}` inserta HTML ya sanitizado; solo funciona con variables que terminan en `_html`.

## 8. Otros puntos de extensión
- **Reportes y notificaciones**: `ticket_eventos` registra todo lo que le pasa a un ticket (tipo, actor, estatus antes y después, datos JSON). Un reporte de "tiempo en cada estatus" sale directo de esa tabla.
- **Importar el sistema anterior**: ver `apps/api/src/modulos/importacion/README.md`.
- **Formato del folio**: `packages/shared/src/folio.ts` (`prefijoFolio`, `formatearFolio`) es el único lugar donde se define.
