# Despliegue en el servidor

> El sistema operativo del servidor está pendiente de confirmar (`DECISIONES.md` P8). Aquí están las dos rutas.

## Requisitos
- Node.js 24 LTS.
- MySQL 8.4 (o MariaDB 11.4+ con ajustes de collation; se recomienda MySQL).
- Un certificado HTTPS de la empresa, o un proxy inverso (IIS o nginx) que lo maneje.
- Unos 2 GB de RAM libres y espacio en disco para adjuntos y respaldos.

## 1. Base de datos
```sql
CREATE DATABASE mesa_ayuda CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'mesa_app'@'localhost' IDENTIFIED BY '<contraseña larga>';
GRANT ALL PRIVILEGES ON mesa_ayuda.* TO 'mesa_app'@'localhost';
GRANT PROCESS, RELOAD ON *.* TO 'mesa_app'@'localhost';   -- para mysqldump
```
En `my.ini` / `my.cnf`: `default-time-zone='+00:00'`, `character-set-server=utf8mb4` y `collation-server=utf8mb4_0900_ai_ci`.

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
DB_HOST=127.0.0.1  DB_PORT=3306  DB_USER=mesa_app  DB_PASSWORD=…
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

## 3b. Linux (systemd + nginx)
`/etc/systemd/system/mesa-ayuda.service`:
```ini
[Unit]
Description=Mesa de Ayuda
After=network.target mysql.service

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
