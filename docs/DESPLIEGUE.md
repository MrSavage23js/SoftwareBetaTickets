# Despliegue en el servidor

> El sistema operativo del servidor está pendiente de confirmar (`DECISIONES.md` P8). Aquí están las dos rutas.

## Requisitos
- Node.js 24 LTS.
- PostgreSQL 16 o superior (se prueba con 17), con las extensiones `unaccent` e ICU (vienen en las distribuciones normales y en Render).
- Un certificado HTTPS de la empresa, o un proxy inverso (IIS o nginx) que lo maneje.
- Unos 2 GB de RAM libres y espacio en disco para adjuntos y respaldos.

## 1. Base de datos
```sql
CREATE ROLE mesa_app LOGIN PASSWORD '<contraseña larga>';
CREATE DATABASE mesa_ayuda OWNER mesa_app ENCODING 'UTF8';
```
El usuario debe ser **dueño** de la base: la primera migración crea la extensión `unaccent` y la intercalación
`sin_acentos`. Las fechas se guardan como `TIMESTAMPTZ` y el sistema abre cada conexión en UTC; no hay que
configurar la zona horaria del servidor.

## 2. Aplicación
```bash
git clone <repositorio> mesa-de-ayuda   # o copiar la carpeta
cd mesa-de-ayuda
npm ci
cp .env.example .env    # y editar
npm run build
```
Valores de `.env` en producción:
```
NODE_ENV=production
APP_URL=https://mesa.grupoaramo.com
COOKIE_SECURE=true
TRUST_PROXY=1            # si hay IIS/nginx delante
DATABASE_URL=postgresql://mesa_app:<contraseña>@127.0.0.1:5432/mesa_ayuda
MAIL_TRANSPORT=graph     # ver docs/CORREO_M365.md
ADMIN_INICIAL_PASSWORD=<temporal; cambiarla al entrar>
STORAGE_DIR=D:\MesaAyuda\storage      # fuera de la carpeta del código y de carpetas públicas
```
Primera prueba: `npm start` → abrir `APP_URL` → iniciar sesión con el admin inicial → **cambiar su contraseña**.

## 3a. Windows Server (servicio con NSSM + IIS)
1. Instalar NSSM (https://nssm.cc) y crear el servicio:
   ```
   nssm install MesaAyuda "C:\Program Files\nodejs\node.exe" "apps\api\dist\server.js"
   nssm set MesaAyuda AppDirectory C:\apps\mesa-de-ayuda
   nssm set MesaAyuda AppStdout C:\apps\mesa-de-ayuda\storage\logs\servicio.log
   nssm set MesaAyuda AppStderr C:\apps\mesa-de-ayuda\storage\logs\servicio.log
   nssm set MesaAyuda AppRotateFiles 1
   nssm set MesaAyuda AppRotateBytes 10485760
   nssm set MesaAyuda AppStopMethodConsole 20000
   nssm start MesaAyuda
   ```
   NSSM reinicia el proceso si se cae. El sistema hace un cierre ordenado al detenerse.
2. HTTPS con IIS como proxy inverso: instalar **URL Rewrite** y **Application Request Routing** (activar "Enable proxy"). Crear un sitio con el certificado y esta regla:
   ```xml
   <rule name="MesaAyuda" stopProcessing="true">
     <match url="(.*)" />
     <action type="Rewrite" url="http://127.0.0.1:3100/{R:1}" />
   </rule>
   ```
   Además, subir `maxAllowedContentLength` a por lo menos `ADJUNTOS_TECHO_MB` × 5.
3. Firewall: abrir solo 443. El 3100 queda accesible únicamente desde el propio servidor.
4. Respaldos: tarea programada (ver README → Respaldos).

## 3a-bis. PC de oficina con túnel fijo de Cloudflare (sin abrir puertos)

Para cuando el "servidor" es una PC con internet normal (IP dinámica o CGNAT). La PC abre una conexión de salida
hacia Cloudflare; nadie entra directo a ella y Cloudflare pone el HTTPS. A diferencia de `npm run tunel`
(trycloudflare, solo para pruebas), la dirección no cambia nunca y los correos no los bloquean los antispam.

Requisitos: una cuenta gratuita de Cloudflare y un dominio cuyo DNS esté en Cloudflare (p. ej. uno comprado ahí).

1. **PostgreSQL 17** con el instalador oficial (queda como servicio de Windows) y la base de datos del paso 1.
2. **Sistema** como en el paso 2, con estos valores en `.env`:
   ```
   NODE_ENV=production
   APP_URL=https://<tu-dominio>
   COOKIE_SECURE=true
   TRUST_PROXY=1
   ```
   y como servicio con NSSM (punto 1 de la sección 3a). No hace falta IIS: el HTTPS lo pone Cloudflare.
3. **Túnel**: en Cloudflare → *Zero Trust* → *Networks* → *Tunnels* → *Create a tunnel* (tipo *Cloudflared*).
   Copiar el comando que muestra para Windows y correrlo en una terminal como administrador:
   ```
   cloudflared.exe service install <TOKEN>
   ```
   Queda como servicio de Windows que arranca solo. En el mismo asistente, *Public hostname*:
   dominio `<tu-dominio>`, servicio `HTTP` → `localhost:3100`.
4. **Firewall de Windows**: no abrir ningún puerto de entrada. El 3100 solo lo usa el túnel desde la misma PC.
5. **Que la PC no se duerma** (terminal como administrador):
   ```
   powercfg /change standby-timeout-ac 0
   powercfg /change hibernate-timeout-ac 0
   ```
   y en Windows Update, *Horas activas* que cubran el horario de trabajo.
6. **Respaldos**: tarea programada diaria (ver README → Respaldos), de preferencia copiando a otro disco o equipo.

Prueba: abrir `https://<tu-dominio>/health` desde un celular con datos (fuera de la red de la oficina).

## 3b. Linux (systemd + nginx)
`/etc/systemd/system/mesa-ayuda.service`:
```ini
[Unit]
Description=Mesa de Ayuda
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/mesa-de-ayuda
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=always
RestartSec=5
User=mesa
Environment=NODE_ENV=production
TimeoutStopSec=25

[Install]
WantedBy=multi-user.target
```
nginx:
```nginx
server {
  listen 443 ssl http2;
  server_name mesa.grupoaramo.com;
  ssl_certificate /etc/ssl/…; ssl_certificate_key /etc/ssl/…;
  client_max_body_size 130m;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 3c. Render (nube)

1. **Base de datos**: en Render → *New* → *Postgres* (versión 17). Al crearla, copiar la **Internal Database URL**.
2. **Web Service** conectado al repositorio de GitHub (Node 24, se toma de `engines` en `package.json`):

| Campo | Valor |
|---|---|
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Al arrancar aplica las migraciones y crea los datos iniciales (admin incluido); no hay que correr nada aparte.

Variables de entorno (en el panel de Render, no en un archivo; el sistema no necesita `.env` si están ahí):
```
NODE_ENV=production
APP_URL=https://<servicio>.onrender.com     # se conoce después del primer despliegue; o el dominio propio
COOKIE_SECURE=true
TRUST_PROXY=1                               # Render pone un proxy delante
DATABASE_URL=<Internal Database URL>        # postgresql://usuario:contraseña@host/base
MAIL_TRANSPORT=smtp  MAIL_FROM=…  MAIL_FROM_NAME=…
SMTP_HOST=mail.aramo.com.mx  SMTP_PORT=26  SMTP_SECURE=false  SMTP_USER=…  SMTP_PASS=…   # ver "Correo" abajo
ADMIN_INICIAL_USUARIO=admin  ADMIN_INICIAL_EMAIL=…  ADMIN_INICIAL_PASSWORD=<temporal; cambiarla al entrar>
```
Los destinatarios del aviso de ticket nuevo no van aquí: se configuran en **Ajustes → Correos**.

Limitaciones del **plan gratuito** de Render que afectan a este sistema:
- **La base gratuita caduca a los 30 días** de creada y, 14 días después, Render la borra con todos los datos
  ([límites del plan gratuito](https://render.com/docs/free)). Solo puede haber una base gratuita por cuenta.
  Para no perder nada, **antes del día 30**:
  1. Respaldo desde una PC con el proyecto, usando la *External Database URL*. La IP pública de esa PC debe estar
     en la base → *Networking* → *Access Control* (por omisión Render no acepta conexiones externas):
     `DATABASE_URL="<External URL>?sslmode=require" npm run respaldo`
  2. En Render, borrar la base vieja y crear una nueva (otra vez gratuita).
  3. Restaurar en la nueva: `npm run restaurar -- storage/respaldos/<carpeta> --url "<External URL nueva>?sslmode=require" --confirmar`
  4. Cambiar `DATABASE_URL` del Web Service por la *Internal URL* nueva.
  Con un plan de pago de la base esto no hace falta.
- **Correo**: el plan gratuito bloquea la salida a los puertos SMTP 25, 465 y 587
  ([aviso de Render](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)).
  El servidor de Aramo (cPanel) también recibe en el **puerto 26** con STARTTLS y usuario/contraseña, que Render no bloquea:
  `SMTP_PORT=26` y `SMTP_SECURE=false` (con `false` el sistema exige STARTTLS, así que el envío sigue cifrado).
  Probado el 02/10/2026: entrega en la bandeja de sistemas@aramo.com.mx, también con enlaces a `onrender.com`
  (los enlaces a `trycloudflare.com`, en cambio, los borra el antispam de Aramo).
  Si un correo falla, queda en **Correos → Cola de salida** con el error y se reintenta solo.
- **Adjuntos**: el disco del servicio se borra en cada despliegue y reinicio. Para conservarlos hace falta un
  *Persistent Disk* (planes de pago) montado en la ruta de `STORAGE_DIR`.
- **El servicio se duerme** sin visitas; mientras duerme no envía la cola de correos ni corre las tareas periódicas.

## 4. Actualizaciones
```bash
npm run respaldo          # siempre antes
git pull && npm ci && npm run build
# reiniciar el servicio: al arrancar aplica las migraciones pendientes
```
Si una migración falla, el servicio no arranca y el error queda en el registro. Se corrige o se restaura el respaldo.

## 5. Monitoreo
- `GET /health` cada minuto (Uptime Kuma, PRTG, Zabbix…). Si responde 503, la BD no está disponible.
- Revisar **Correos → Cola de salida**: si hay correos FALLIDOS, casi siempre son credenciales vencidas.
