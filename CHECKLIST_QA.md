# Checklist de QA manual (antes de presentar)

Prepara: dos navegadores (o uno normal y otro en ventana privada), un usuario **admin** y dos usuarios solicitantes (**U1** con la empresa A; **U2** con la empresa B), y `MAIL_TRANSPORT=consola` o Mailpit.
Marca cada punto: ✅ bien · ❌ falla (anota qué pasó).

## 1. Acceso
- [ ] Usuario o contraseña incorrectos → "Usuario o contraseña incorrectos." (no dice cuál de los dos falló).
- [ ] 5 intentos fallidos seguidos → cuenta bloqueada 15 min con mensaje claro; el admin la ve igual en Usuarios.
- [ ] Iniciar sesión → entra a Tickets; el nombre y el rol aparecen abajo a la izquierda.
- [ ] Cerrar sesión (botón inferior) → vuelve a Inicio; el botón "atrás" no muestra datos.
- [ ] Sin tocar nada durante el tiempo de inactividad (baja el ajuste a 5 min para probar): al minuto final aparece el aviso "Seguir conectado"; si no se responde, cierra la sesión con el mensaje "por inactividad".
- [ ] U1 no ve en el menú Usuarios, Catálogos, Correos ni Ajustes.
- [ ] U1 escribe a mano `/usuarios`, `/catalogos`, `/correos`, `/ajustes` → "No tienes acceso a esta sección".
- [ ] U1 abre `/tickets/<id de un ticket de U2>` → "El ticket no existe" (no muestra nada ajeno).
- [ ] Un usuario recién creado por el admin, al entrar, ve "Cambia tu contraseña" y no puede usar nada más hasta cambiarla.
- [ ] Botón del candado (abajo a la izquierda) → cambiar la contraseña propia; la sesión abierta en otro navegador se cierra.

## 2. Solicitante
- [ ] Nuevo ticket: sin elegir tipo solo aparece el mensaje "Selecciona un tipo…".
- [ ] Al elegir cada tipo, el título de la sección cambia ("Detalle de la corrección", "Detalle de la cancelación"…).
- [ ] La lista de empresas muestra solo las asignadas a U1 (con una sola, ya aparece seleccionada).
- [ ] Enviar vacío → cada campo obligatorio se marca en rojo con su mensaje.
- [ ] Editor: negrita, cursiva, subrayado, listas, color, enlace, pegar una imagen (se sube y aparece), quitar formato.
- [ ] Adjuntar un PDF y una imagen; intentar un `.exe` → rechazado con mensaje; intentar un archivo mayor al límite → rechazado.
- [ ] "Enviar copia a": buscar un compañero por nombre y además escribir un correo externo.
- [ ] Crear → ventana con el **folio** y el aviso de correo; el folio sigue el formato `DEPTO-AÑO-CONSECUTIVO` (p. ej. SIS-2026-0001) y el departamento viene preseleccionado con el del usuario.
- [ ] Crear otro ticket en otro departamento (p. ej. RH) → su consecutivo empieza en 0001, independiente de SIS.
- [ ] El correo llega con el folio al inicio del asunto (`[SIS-2026-0001] Ticket creado · …`) y se encuentra buscando el folio en Outlook.
- [ ] En `storage/correos-consola` (o Mailpit) está el correo con folio, tipo, empresa, módulo, concepto, folio(s), estatus y el botón "Ver ticket en el sistema"; las copias van en CC.
- [ ] Mis tickets: agrupados por día ("Hoy", "Ayer", fecha); filtros por estatus con contadores; búsqueda por folio y por concepto.
- [ ] Detalle: barra de avance en "Creado"; comentar con adjunto funciona; en un ticket Completado ya no aparece la caja de comentario.

## 3. Admin soporte
- [ ] Bandeja: ve los tickets de U1 y U2; los contadores de las pestañas cuadran.
- [ ] Búsqueda por folio, concepto, nombre del solicitante, nombre de empresa y folio(s).
- [ ] Filtros: tipo, empresa, módulo, técnico ("Sin asignar" incluido) y rango de fechas; "Limpiar filtros".
- [ ] Recargar la página conserva los filtros (están en la URL).
- [ ] Kanban: 4 columnas con contadores; clic en una tarjeta abre el detalle; con más de 50 tickets en una columna aparece "Ver más".
- [ ] Ticket pendiente: la caja dice "Toma el ticket para poder responder o cerrarlo".
- [ ] **Tomar** → pasa a En proceso con el admin asignado. En otro navegador, con otro admin, tomar el mismo ticket → "Otro técnico ya tomó este ticket".
- [ ] Responder con formato e imagen → U1 lo ve en su conversación; la barra marca "En proceso".
- [ ] Pausar pide motivo → Pausado; Reanudar → En proceso.
- [ ] Reasignar a otro técnico → el primero ya no puede responder ni cerrar (ve el aviso "Este ticket lo atiende…").
- [ ] Cerrar sin resolución → no deja; con resolución → Completado, barra completa y correo "Ticket cerrado" con técnico y resolución.
- [ ] Historial muestra todo en orden: creó, tomó, respondió, pausó (con motivo), reasignó (de → a), cerró.
- [ ] Cambios simultáneos: con el ticket abierto en dos pestañas, pausar en una y luego cerrar en la otra → aviso "El ticket cambió…" y la pantalla se actualiza.

## 3 bis. Urgencia, dashboard y notificaciones
- [ ] Nuevo ticket: la urgencia viene en "Media"; elegir "Crítica" → el ticket la muestra con su nombre y nivel en la lista, el Kanban y el detalle.
- [ ] Bandeja → "Ordenar: Urgencia" → las críticas quedan arriba. El filtro "Urgencia" funciona.
- [ ] Un admin entra y aterriza en el **Dashboard**. Las tarjetas cuadran con la bandeja. Clic en "Críticos sin atender" → la tabla muestra solo esos.
- [ ] Gráficas: pasar el cursor por una barra muestra el detalle; un clic filtra la tabla.
- [ ] Un solicitante no ve "Dashboard" en el menú; si escribe `/panel` ve "No tienes acceso".
- [ ] Al crear un ticket, en menos de 20 s la campana del admin muestra el contador. El aviso lleva al ticket y se marca como leído.
- [ ] Al responder, tomar o cerrar, la campana del solicitante avisa. "Marcar todas como leídas" deja el contador en cero.

## 4. Usuarios
- [ ] Tabla: ID, usuario, rol, empresas, último inicio ("Nunca" si no ha entrado), En línea/Desconectado.
- [ ] Alta: usuario duplicado → error; contraseñas distintas → error; correo inválido → error; alta correcta con varias empresas.
- [ ] Edición: cambiar empresas y rol; cambiar contraseña → sus sesiones abiertas se cierran.
- [ ] "Cerrar sesión" solo aparece si el usuario está en línea; al usarlo, el otro navegador vuelve a Inicio en su siguiente acción.
- [ ] Eliminar pide confirmación; el usuario ya no puede entrar y **sus tickets siguen visibles** en la bandeja.
- [ ] No se puede eliminar ni desactivar al propio admin, ni al último administrador.

## 5. Catálogos, plantillas y ajustes
- [ ] Agregar empresa con código; código repetido → error. Desactivarla → ya no aparece en Nuevo ticket, pero los tickets viejos la siguen mostrando.
- [ ] Catálogos → Departamentos: agregar uno nuevo (p. ej. CONTA) y crear un ticket con él → CONTA-AÑO-0001.
- [ ] Cambiar el código de un departamento con tickets → aviso; el siguiente ticket usa el código nuevo desde 0001; los folios viejos no cambian.
- [ ] Correos → Plantillas: quitar `{{folio}}` del asunto de una plantilla de ticket → no deja guardar.
- [ ] Tipo con "Módulo" no obligatorio → en Nuevo ticket el módulo dice "(opcional)".
- [ ] Plantillas: editar el asunto y el cuerpo; la vista previa se actualiza; un `<script>` en el cuerpo se elimina al guardar.
- [ ] Ajustes: activar "correo en respuestas" → al responder se encola un correo al solicitante.
- [ ] Ajustes: bajar el tamaño máximo de archivo → el límite nuevo se aplica al instante.

## 6. Robustez
- [ ] Detener MySQL con el sistema abierto: las pantallas muestran "No se pudo cargar…" con Reintentar (no quedan en blanco); `/health` responde 503. Al volver MySQL, todo sigue funcionando sin reiniciar.
- [ ] Con correo mal configurado (p. ej. `MAIL_TRANSPORT=smtp` con host inexistente): crear un ticket **sí funciona**; en Correos → Cola aparece el error y el reintento programado.
- [ ] Respaldo: `npm run respaldo` y luego restaurar en una base aparte (README → Restauración): los conteos coinciden.
- [ ] Apariencia: tema claro y oscuro del sistema operativo; ancho de celular (~400 px) sin desbordes.
