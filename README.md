# Mesa de Ayuda — Grupo Aramo

Sistema de tickets de soporte. Tiene dos vistas: la del **solicitante** (Mis tickets, crear, comentar) y la del **Admin soporte** (dashboard con indicadores, bandeja, Kanban, tomar, pausar, reasignar, responder y cerrar; además usuarios, catálogos, correos y ajustes). Cada ticket lleva una urgencia (baja, media, alta o crítica). Los avisos llegan por correo a Outlook y a la campana de notificaciones dentro del sistema.

| Documento | Para qué |
|---|---|
| `PLAN.md` | Fases y criterios de terminado |
| `DECISIONES.md` | Supuestos, decisiones técnicas y preguntas abiertas (`CONFIRMAR`) |
| `docs/MODELO_DATOS.md` | Tablas, relaciones e índices |
| `docs/EXTENDER.md` | Cómo agregar tipos, módulos, empresas, campos, estatus, roles y plantillas |
| `docs/DESPLIEGUE.md` | Instalación en el servidor (Windows, Linux o Render) |
| `docs/CORREO_M365.md` | Qué pedirle al administrador de Microsoft 365 |
| `docs/SEGURIDAD.md` | Controles de seguridad y **lista obligatoria antes de publicar** |
| `CHECKLIST_QA.md` | Pruebas manuales antes de presentar |
| `CHANGELOG.md` | Historial de cambios |

## Tecnología

Node.js 24 · TypeScript · Express 5 · PostgreSQL 17 · Kysely · React 19 + Vite · TipTap · zod · argon2 · pino.
En producción es **un solo proceso**: la API sirve también la aplicación web ya compilada.

```
apps/api         API, migraciones, seeds, cola de correo
apps/web         Aplicación web (React)
packages/shared  Reglas compartidas: estatus, máquina de estados, permisos, validaciones
scripts/         PostgreSQL portátil, desarrollo, CI local, respaldo y restauración
docs/            Documentación técnica
referencia/      Maqueta de diseño (las capturas del sistema anterior no se publican: tienen datos reales)
storage/         (no va en git) adjuntos, correos de consola, respaldos
```

## Instalación para desarrollo

Requisitos: **Node.js 24+** y **git**. PostgreSQL puede ser el portátil incluido o Docker.

```bash
npm install
cp .env.example .env              # en Windows: copy .env.example .env

# Base de datos: elige UNA opción
npm run db:local -- instalar      # sin Docker: PostgreSQL 17 portátil (viene con npm install) en :5433
docker compose -f docker/docker-compose.yml up -d   # con Docker

npm run dev                       # API en :3100 y web en http://localhost:5180
```

Al arrancar, la API aplica las migraciones y siembra los catálogos, las plantillas y los ajustes. También crea el administrador inicial que definen `ADMIN_INICIAL_*` en `.env`. **Cambia esa contraseña después del primer inicio de sesión.**

> ⚠ Si el proyecto está dentro de OneDrive, no guardes los datos de la base ahí: la sincronización los corrompe. El PostgreSQL portátil ya los guarda en `%LOCALAPPDATA%\mesa-ayuda\pg-datos`.

PostgreSQL portátil: `npm run db:local -- iniciar | detener | estado`. Hay que iniciarlo después de reiniciar el equipo.

## Variables de entorno (`.env`)

Todas están documentadas en `.env.example`. Las principales:

| Variable | Descripción |
|---|---|
| `APP_URL` | URL pública del sistema. La usa el botón "Ver ticket en el sistema" de los correos. |
| `PORT` | Puerto de la API y la web (3100 por omisión). |
| `DATABASE_URL` | Conexión a PostgreSQL: `postgresql://usuario:contraseña@host:puerto/base`. |
| `COOKIE_SECURE` | `true` en producción (requiere HTTPS). Si es `false` en producción, el sistema no arranca. |
| `TRUST_PROXY` | `1` si el sistema corre detrás de IIS o nginx. |
| `STORAGE_DIR` | Carpeta de adjuntos y respaldos (fuera de cualquier carpeta pública). |
| `ADJUNTOS_TECHO_MB` | Máximo absoluto por archivo. El límite real se ajusta en pantalla. |
| `MAIL_TRANSPORT` | `consola` (guarda `.eml`), `smtp` o `graph`. Ver `docs/CORREO_M365.md`. |
| `ADMIN_INICIAL_*` | Primer administrador; solo se usa si no existe ninguno. |
| `RESPALDOS_*` | Carpeta y días de retención de los respaldos. |

Lo que se configura **desde la pantalla** (menú Ajustes, Catálogos y Correos → Plantillas): tiempo de inactividad, intentos de inicio de sesión, límites y tipos de archivos, correos intermedios, empresas, tipos, módulos y códigos de folio, y plantillas de correo.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y web con recarga automática |
| `npm run build` | Compila la web y la API en `dist/` |
| `npm start` | Inicia la versión compilada (producción) |
| `npm run tunel` | Publica el sistema de esta PC con un enlace https temporal (Cloudflare) para que alguien de fuera lo pruebe. Necesita `cloudflared.exe` en `%LOCALAPPDATA%mesa-ayuda`; el enlace cambia en cada ejecución y solo funciona mientras la ventana esté abierta |
| `npm run ci` | Lint, tipos, pruebas, auditoría de dependencias y build (hay que pasarlo antes de cada commit); `-- --e2e` agrega los recorridos en navegador |
| `npm test` | Pruebas unitarias y de API |
| `npm run test:e2e` | Recorridos completos en navegador (Playwright); `E2E_COMPILAR=1` para recompilar la web antes |
| `npm run carga -w @mesa/api` | Prueba de carga con 20,000 tickets en la BD de pruebas |
| `npm run db:migrar` / `db:seed` | Aplica migraciones y datos iniciales (también se hacen solos al arrancar) |
| `npm run crear-admin -- --usuario X --email Y --password Z` | Crea otro administrador |
| `npm run respaldo` | Respalda la BD y los adjuntos |
| `npm run restaurar -- <carpeta> --confirmar` | Restaura un respaldo |

## Pruebas automatizadas

Necesitan PostgreSQL encendido. Usan **otra base de datos** (`DATABASE_URL_TEST`, por omisión la de `DATABASE_URL` con el sufijo `_test`) y otra carpeta de archivos (`storage/pruebas`, `storage/e2e`). **Nunca tocan los datos reales.**

| Tipo | Dónde | Qué cubre |
|---|---|---|
| Unitarias | `packages/shared/test`, `apps/api/test/unitarias` | Máquina de estados, folio, validaciones, sanitización XSS, plantillas, reintentos, fechas |
| API (Supertest) | `apps/api/test/api` | Cada endpoint: casos correctos, datos inválidos y acceso denegado (401/403/404); folio con 50 tickets simultáneos; "tomar" concurrente; flujo completo de soporte; adjuntos maliciosos; correo que falla y se reintenta; cabeceras de seguridad |
| En navegador (Playwright) | `e2e/` | Iniciar sesión → crear ticket → verlo como admin → tomarlo → responder → cerrar → correo en la cola; alta, edición, cierre de sesión y baja de un usuario; un usuario no entra a pantallas de admin; retorno seguro después de iniciar sesión |
| Carga | `apps/api/test/carga.ts` | 20,000 tickets: p95 de cada consulta por debajo de 100 ms (meta: 300 ms) |

La primera vez: `npx playwright install chromium`.

## Respaldos

`npm run respaldo` crea `storage/respaldos/AAAA-MM-DD_HHMMSS/` con:
- `bd.jsonl.gz`: todas las filas, leídas en una sola transacción de solo lectura (copia consistente que no detiene el sistema). No necesita `pg_dump`: funciona igual contra la base local que contra una remota como Render (`DATABASE_URL=… npm run respaldo`);
- `adjuntos/`: copia de todos los archivos;
- `manifiesto.json`: fecha, tamaños y SHA-256 para verificar la integridad.

Al terminar borra los respaldos con más días que `RESPALDOS_RETENCION_DIAS`. Si algo falla, borra el respaldo incompleto y termina con código de error. **Copia esa carpeta a otro equipo o a la nube**: un respaldo en el mismo disco no protege contra la falla del disco.

**Programarlo en Windows** (todos los días a las 23:00):
```
schtasks /Create /SC DAILY /ST 23:00 /TN "MesaAyuda-Respaldo" /TR "cmd /c cd /d C:\ruta\mesa-de-ayuda && npm run respaldo >> storage\respaldos\respaldo.log 2>&1"
```
**En Linux** (`crontab -e`): `0 23 * * * cd /opt/mesa-de-ayuda && npm run respaldo >> storage/respaldos/respaldo.log 2>&1`

### Restauración (probada el 29/09/2026)

1. Detén el servicio (`nssm stop MesaAyuda` o `systemctl stop mesa-ayuda`).
2. Verifica el respaldo **sin tocar producción**, restaurándolo en una base aparte:
   `npm run restaurar -- storage/respaldos/2026-09-29_230000 --bd mesa_ayuda_verificacion --sin-adjuntos --confirmar`
   El script comprueba el SHA-256 y muestra cuántos tickets, usuarios y adjuntos trae.
3. Restaura sobre la base real: `npm run restaurar -- storage/respaldos/2026-09-29_230000 --confirmar`
4. Inicia el servicio y abre `/health`.

La base destino debe existir (la del paso 2 se crea antes, p. ej. `CREATE DATABASE mesa_ayuda_verificacion OWNER mesa_app`). Antes de cargar, el script aplica las migraciones; la carga es una sola transacción: si algo falla, la base queda como estaba. Para otro servidor (p. ej. una base nueva en Render) usa `--url postgresql://…` en lugar de `--bd`.

Los respaldos de la versión con MySQL (`bd.sql.gz`) no se pueden cargar en PostgreSQL.

## Salud y registros

- `GET /health` responde `200 {"estado":"ok","bd":"ok"}` o `503` si la BD no responde. Sirve para el monitoreo.
- Los registros (pino) salen por la salida estándar en JSON; en desarrollo se ven con formato legible. Nunca incluyen contraseñas, cookies ni tokens.
- Cada error inesperado muestra al usuario un código corto (por ejemplo `a1b2c3d4`). Ese mismo código aparece en el registro.

## Despliegue

Ver `docs/DESPLIEGUE.md`.
