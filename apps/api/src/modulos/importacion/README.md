# Importación del sistema anterior — PREVISTO, NO CONSTRUIDO

Este módulo está reservado para migrar los usuarios y tickets del sistema actual (unos 36 usuarios y más de 2,566 tickets al 28/09/2026).
Está pendiente de confirmar si se hará (`DECISIONES.md` P6).

## Lo que ya está listo en el modelo

| Tabla | Campos | Uso |
|---|---|---|
| `usuarios` | `origen` (`SISTEMA`/`IMPORTADO`), `id_anterior` | Relaciona cada usuario con su id en el sistema viejo. `UNIQUE(origen, id_anterior)` permite reintentar la importación sin duplicar. |
| `tickets` | `origen`, `id_anterior` | Lo mismo para los tickets. |
| `folio_consecutivos` | `prefijo`, `ultimo` | Después de importar hay que ajustar cada prefijo al folio más alto importado (ver paso 5). |
| `ticket_eventos` | `tipo = 'IMPORTADO'` | Un evento por ticket importado que diga de dónde vino. |

Si un folio nuevo coincide con uno importado, `crearTicket` salta al siguiente número libre gracias a `UNIQUE(folio)`. Aun así, conviene hacer el paso 5.

## Pasos cuando se decida importar

1. Obtener un respaldo o acceso de solo lectura a la BD del sistema anterior y documentar su esquema aquí.
2. Crear `importar.ts` con este contrato:
   ```ts
   export interface FuenteAnterior {
     usuarios(): AsyncIterable<{ idAnterior: number; username: string; email: string; rol: 1 | 2; empresas: string[]; ultimoLogin: Date | null }>;
     tickets(): AsyncIterable<{ idAnterior: number; folio: string; tipo: string; empresa: string; modulo: string | null; concepto: string | null;
       folios: string | null; descripcionHtml: string; estatus: string; solicitanteIdAnterior: number; tecnicoIdAnterior: number | null;
       creadoAt: Date; cerradoAt: Date | null; mensajes: { autorIdAnterior: number; html: string; fecha: Date }[] }>;
   }
   ```
3. Relacionar los catálogos por nombre (empresa, tipo, módulo). Lo que no coincida se reporta y no se inventa.
4. Por cada ticket, en una transacción: insertar con `origen='IMPORTADO'`, sanitizar el HTML con `sanitizarContenido`, insertar los mensajes y registrar el evento `IMPORTADO`.
   - Los usuarios importados reciben una contraseña aleatoria; el admin se las restablece. Nunca se copian los hashes del sistema viejo.
5. Ajustar los consecutivos: `INSERT INTO folio_consecutivos … SELECT prefijo, MAX(número) … ON DUPLICATE KEY UPDATE ultimo = GREATEST(ultimo, VALUES(ultimo))`.
6. Agregar el comando `npm run importar -- --origen <conexión> --simulacro`. El simulacro corre todo dentro de una transacción que al final se revierte, y solo muestra el reporte.
7. Hacer un respaldo (`npm run respaldo`) antes de la importación real.
