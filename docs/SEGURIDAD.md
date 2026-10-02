# Seguridad — controles y lista previa a publicar

La Mesa de Ayuda la usará toda la empresa y puede quedar accesible desde internet. Este documento resume qué protege el sistema, cómo se comprueba y qué debe hacer quien lo instala.

## 1. Controles implementados (y su prueba automática)

| Riesgo | Control | Prueba |
|---|---|---|
| Robo de contraseñas | argon2id (19 MiB, 2 iteraciones, recomendación de OWASP); nunca se registran ni se devuelven | `auth.test.ts`, `usuarios.test.ts` |
| Fuerza bruta | Bloqueo temporal tras N intentos por usuario (ajustable) y límite de intentos por IP | `auth.test.ts` |
| Descubrir qué usuarios existen | Mismo mensaje y mismo tiempo de respuesta para usuario inexistente o contraseña incorrecta | `seguridad.test.ts` |
| Robo de sesión | Token aleatorio de 256 bits; cookie `HttpOnly`, `SameSite=Strict` y, con HTTPS, `Secure` con prefijo `__Host-`; en BD solo se guarda su SHA-256 | `auth.test.ts` |
| Sesiones olvidadas abiertas | Cierre por inactividad **real** (no la cuenta tener la pestaña abierta), duración máxima y cierre remoto por el admin | `auth.test.ts`, e2e |
| Contraseñas conocidas por el admin | Toda contraseña asignada o restablecida por el admin se debe cambiar en el siguiente inicio de sesión | `auth.test.ts`, e2e |
| CSRF | `SameSite=Strict` + verificación de `Origin` + token por sesión en cada petición que modifica datos | `auth.test.ts` |
| XSS | HTML del editor sanitizado en el servidor con lista blanca; CSP `script-src 'self'`; correos con variables escapadas | `sanitizar-y-plantillas.test.ts`, `tickets.test.ts`, `correos.test.ts` |
| Ver o modificar tickets ajenos | Permiso verificado en el servidor en cada endpoint; un ticket ajeno responde 404 (no revela que existe) | `permisos.test.ts` (todos los endpoints), `tickets.test.ts`, e2e |
| Escalar privilegios desde la pantalla | El menú se arma por permisos, pero **quien decide es el servidor** | `permisos.test.ts`, e2e |
| Archivos maliciosos | Extensión y **contenido real** verificados; nombre aleatorio; fuera de la carpeta pública; descarga con permiso, `nosniff` y CSP `sandbox`; solo imágenes y PDF se abren en el navegador | `adjuntos.test.ts` |
| Inyección SQL | Todas las consultas son parametrizadas (Kysely); sin SQL armado con texto del usuario | revisión de código |
| Inyección de cabeceras en correos | Asunto sin saltos de línea; URL de los botones restringidas al propio sistema | `sanitizar-y-plantillas.test.ts` |
| Redirección abierta | `?volver=` solo acepta rutas internas | e2e |
| Clickjacking | `frame-ancestors 'none'` | `seguridad.test.ts` |
| Indexación en buscadores | `X-Robots-Tag: noindex` y `robots.txt` | `seguridad.test.ts` |
| Denegación de servicio | Límites de peticiones (por usuario con sesión; por IP sin sesión), tamaño máximo de cuerpo y de archivos, tiempos de espera | `seguridad.test.ts` |
| Consultas lentas con muchos datos | Índices y paginación con "ids primero"; p95 < 100 ms con 20,000 tickets | `npm run carga -w @mesa/api` |
| Pérdida de datos | Respaldos con verificación SHA-256 y restauración probada | README → Respaldos |
| Rastreo de incidentes | Registro de accesos (usuario, ruta, estatus, duración, IP), auditoría de acciones de admin, historial por ticket, id de petición en cada error | — |
| Dependencias vulnerables | `npm audit --omit=dev` dentro de `npm run ci` | CI local |

## 2. Lista obligatoria antes de publicar

- [ ] **HTTPS** con un certificado válido. En `.env`: `NODE_ENV=production`, `APP_URL=https://…` y `COOKIE_SECURE=true`. El sistema **no arranca** en producción sin esto.
- [ ] `TRUST_PROXY=1` si hay IIS o nginx delante. Sin esto, todas las peticiones parecen venir de la misma IP y el límite por IP bloquea a todos.
- [ ] Cambiar la contraseña del administrador inicial al primer ingreso (el sistema lo exige) y **borrar `ADMIN_INICIAL_PASSWORD` del `.env`** después.
- [ ] Usuario de PostgreSQL exclusivo para el sistema, dueño solo de su base (`docs/DESPLIEGUE.md`). PostgreSQL escuchando solo en `127.0.0.1` o en la red interna, **nunca expuesto a internet** (en Render, la URL externa solo para respaldos y con `sslmode=require`).
- [ ] El proceso corre con una cuenta de servicio **sin privilegios de administrador**.
- [ ] `.env` legible solo por esa cuenta y por los administradores (contiene secretos del correo y de la BD).
- [ ] `STORAGE_DIR` fuera de la carpeta del código y de cualquier carpeta que sirva IIS o nginx.
- [ ] Firewall: solo el puerto 443 abierto hacia afuera; el 3100 solo local.
- [ ] Respaldos programados **y copiados fuera del servidor**. Contienen los hashes de contraseñas y los datos de los tickets: guárdalos cifrados o con acceso restringido.
- [ ] Monitoreo de `/health` y alerta si hay correos FALLIDOS en la cola.
- [ ] Hacer una prueba de restauración cada mes (README → Restauración).
- [ ] Correr `npm run ci -- --e2e` en verde con la versión que se va a publicar.

## 3. Riesgos aceptados (decisiones conscientes)

- **El bloqueo por intentos revela que la cuenta existe** después de N fallos, y alguien podría bloquear a propósito la cuenta de otra persona. Es el equilibrio habitual: el bloqueo dura minutos y el límite por IP frena los ataques masivos.
- **"Enviar copia a" permite buscar compañeros por nombre y ver su correo.** Es el directorio de la empresa, igual que en Outlook. Exige al menos 2 caracteres y devuelve como máximo 20 resultados.
- **CSP con `style-src 'unsafe-inline'`**: el editor aplica el color de texto con estilos en línea. Los scripts siguen restringidos a `'self'`, que es lo que importa contra XSS.
- **Límites de peticiones en memoria**: suficientes con un solo proceso. Si algún día hay varios servidores, hay que moverlos a un almacén compartido.

## 4. Cómo reportar un problema de seguridad
Escribe al responsable del sistema (definir contacto) con los pasos para reproducirlo. No lo publiques en grupos ni en tickets del propio sistema.
