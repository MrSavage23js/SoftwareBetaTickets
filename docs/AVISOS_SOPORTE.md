# Avisos por correo a soporte

Correos que recibe el buzón de soporte, aparte de los que recibe el solicitante:

| Aviso | Cuándo sale | Ajuste que lo enciende | Plantilla |
| --- | --- | --- | --- |
| Ticket nuevo | Al crear un ticket | `correo.aviso_soporte_activo` (apagado al inicio) | `TICKET_NUEVO_SOPORTE` |
| Ticket cerrado | Al **Cerrar** o marcar **No procede** | `correo.aviso_cierre_activo` (encendido al inicio) | `TICKET_CERRADO_SOPORTE` |

Los dos van a los correos de `correo.aviso_soporte_destino` (varios separados por coma). **Si ese campo está vacío no se envía ninguno.** Cada aviso se puede apagar por separado. Las respuestas de la conversación no se avisan a soporte.

Todo se configura en **Ajustes → Correos**. El texto de los correos se edita en **Plantillas de correo**, donde también se pueden desactivar.

## Aviso de ticket cerrado

Agregado el 2026-10-03 (commit `d970a27`).

- Asunto: `Ticket cerrado: <folio> — <estatus>` (Completado o No procede).
- Cuerpo: quién lo cerró, de quién era el ticket (nombre y correo), fecha de cierre, resolución, datos del ticket y el botón "Ver ticket en el sistema".
- El correo de cierre al solicitante (`TICKET_CERRADO`) no cambió.

## Dónde está en el código

| Archivo | Qué contiene |
| --- | --- |
| `apps/api/src/modulos/tickets/operaciones.ts` | `correosCierre()`: encola el correo al solicitante y el aviso a soporte. La usan `cerrar()` y `noProcede()`. El aviso de ticket nuevo está en `crearTicket`. |
| `apps/api/src/db/seeds/plantillas-iniciales.ts` | Texto inicial de las plantillas |
| `apps/api/src/modulos/correos/cola.ts` | `CODIGOS_PLANTILLA` y `encolarCorreo()` |
| `packages/shared/src/ajustes.ts` | Definición y validación de los ajustes |
| `apps/api/src/db/seeds/index.ts` | Valor inicial de los ajustes |
| `apps/web/src/paginas/Ajustes.tsx` | En qué grupo aparecen en pantalla |
| `apps/api/test/api/flujo-soporte.test.ts` | Pruebas "aviso a soporte al crear" y "aviso a soporte al cerrar" |

## Cosas a tener en cuenta si se cambia

- **No hay migración.** Las plantillas y los ajustes los crean los seeds al arrancar el servidor, y solo insertan lo que falta. Por eso, cambiar el texto de una plantilla en el código **no actualiza una base que ya existe**: hay que editarla en Plantillas de correo, o borrar la fila de `plantillas_correo` para que se vuelva a crear al reiniciar.
- La descripción de los ajustes sí se toma del código (`packages/shared/src/ajustes.ts`), así que cambiarla se ve de inmediato.
- Para agregar un aviso nuevo: agrega el código a `CODIGOS_PLANTILLA`, la plantilla a `plantillas-iniciales.ts`, el ajuste a `ajustes.ts` y a `valoresInicialesAjustes()`, la clave al grupo "Correos" de `Ajustes.tsx`, y llama a `encolarCorreo()` desde la operación.
- Los correos se encolan en `correos_salida` **dentro de la misma transacción** que la operación. Si el cierre falla, no sale correo. Si el envío falla, el cierre ya quedó hecho y el correo se reintenta solo.
- El folio siempre va en el asunto, aunque se edite la plantilla (lo agrega `encolarCorreo()`).

## Pruebas y publicación

- Pruebas: `npm run db:local -- iniciar` (PostgreSQL local) y luego `npm test`.
- Render: el 2026-10-03 un push a `main` **no** inició la publicación automática. Después de subir cambios, revisa en Render que haya un despliegue nuevo; si no, lánzalo con "Manual Deploy" o por la API. Ver `docs/DESPLIEGUE.md`.
