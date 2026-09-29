# Correo con Microsoft 365 — qué pedirle al administrador

El sistema envía los avisos (ticket creado, ticket cerrado y, si se activa, las respuestas) desde **un buzón de la empresa**, por ejemplo `mesadeayuda@grupoaramo.com`. Hay dos opciones; se elige con `MAIL_TRANSPORT` en `.env`.

Mientras no haya credenciales, usa `MAIL_TRANSPORT=consola`: los correos quedan como archivos `.eml` en `storage/correos-consola/` (se abren con Outlook) y todo lo demás funciona igual.

## Opción A (recomendada): Microsoft Graph

Es la forma que Microsoft recomienda: no usa contraseñas de buzón ni depende de SMTP AUTH, que Microsoft está retirando.

**Texto para enviar al administrador de Microsoft 365:**

> Necesitamos que la Mesa de Ayuda envíe correos desde el buzón **mesadeayuda@…** usando Microsoft Graph. Por favor:
> 1. Crear (o indicar) el buzón compartido **mesadeayuda@…**. No necesita licencia si es buzón compartido.
> 2. En **Entra ID → Registros de aplicaciones → Nuevo registro**: nombre "Mesa de Ayuda", tipo "Solo esta organización". No requiere URI de redirección.
> 3. En **Permisos de API → Agregar → Microsoft Graph → Permisos de aplicación → `Mail.Send`**, y luego **Conceder consentimiento de administrador**.
> 4. **Limitar la aplicación a ese único buzón** (importante: sin esto podría enviar como cualquier usuario). Con Exchange Online PowerShell:
>    ```powershell
>    New-DistributionGroup -Name "MesaAyuda-Envio" -Type Security -Members mesadeayuda@…
>    New-ApplicationAccessPolicy -AppId <ID de aplicación> -PolicyScopeGroupId "MesaAyuda-Envio" -AccessRight RestrictAccess -Description "Mesa de Ayuda solo envía desde su buzón"
>    Test-ApplicationAccessPolicy -Identity mesadeayuda@… -AppId <ID de aplicación>   # debe decir Granted
>    ```
>    (Si el tenant usa "RBAC for Applications", el equivalente es una asignación de rol limitada a ese buzón.)
> 5. En **Certificados y secretos → Nuevo secreto de cliente**: vigencia de 24 meses. Anotar la fecha de vencimiento.
> 6. Entregarnos: **Id. de directorio (tenant)**, **Id. de aplicación (cliente)**, el **valor del secreto** y el buzón.

**`.env`:**
```
MAIL_TRANSPORT=graph
MAIL_FROM=mesadeayuda@grupoaramo.com
MAIL_FROM_NAME=Mesa de Ayuda
GRAPH_TENANT_ID=<id de directorio>
GRAPH_CLIENT_ID=<id de aplicación>
GRAPH_CLIENT_SECRET=<valor del secreto>
GRAPH_REMITENTE=mesadeayuda@grupoaramo.com
```
Los correos enviados se guardan en "Elementos enviados" de ese buzón. **Pon un recordatorio** para renovar el secreto antes de que venza. Si vence, los correos se quedan en la cola como FALLIDO con el error "Graph 401" y basta con reintentarlos desde **Correos → Cola** después de actualizar el secreto.

## Opción B: SMTP de Office 365

Solo si no se puede usar Graph. Requiere que **SMTP AUTH esté habilitado** para el buzón (Microsoft lo desactiva por defecto y lo está retirando).

> Habilitar "SMTP autenticado" para el buzón **mesadeayuda@…** (Centro de administración → Usuarios → buzón → Correo → Administrar aplicaciones de correo electrónico → SMTP autenticado) y darnos su contraseña. Si la cuenta tiene MFA, se necesita una contraseña de aplicación.

```
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false        # 587 usa STARTTLS
SMTP_USER=mesadeayuda@grupoaramo.com
SMTP_PASS=<contraseña>
MAIL_FROM=mesadeayuda@grupoaramo.com
```
Si la empresa tiene un relay SMTP interno (por ejemplo un servidor Exchange local), también sirve: pon su host y puerto, sin usuario si el relay lo permite.

## Cómo se comporta el sistema si el correo falla
- Crear o cerrar un ticket **nunca** falla por culpa del correo: el correo queda en la cola (`correos_salida`) dentro de la misma operación.
- El trabajador reintenta con esperas de 1 min, 5 min, 15 min, 1 h, 6 h y 24 h. Al agotar los intentos lo marca como **FALLIDO** y lo registra en el historial del ticket.
- En **Correos → Cola de salida** se ve el error de cada correo y se puede **reintentar**.
