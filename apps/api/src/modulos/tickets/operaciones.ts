// Operaciones que modifican tickets. Todas siguen el mismo patrón:
//   1. validar entrada y guardar archivos (fuera de la transacción: es lo lento)
//   2. transacción: bloquear el ticket (FOR UPDATE) → validar regla → actualizar → mensaje/adjuntos → evento → correo en cola
//   3. si algo falla, se revierte todo y se borran los archivos ya movidos
import {
  ESTATUS,
  INFO_ESTATUS,
  INFO_URGENCIA,
  PERMISOS,
  esquemaCerrar,
  esquemaMensaje,
  esquemaNoProcede,
  esquemaPausar,
  esquemaReasignar,
  esquemaTicketCrear,
  esquemaVersion,
  listaCorreos,
  validarAccion,
  type Accion,
  type Estatus,
  type TicketCreado,
} from '@mesa/shared';
import { sql } from 'kysely';
import { env } from '../../config/env';
import { db, type Tx } from '../../db/conexion';
import type { CambioTicket, Destinatario, Ticket, TipoMensaje } from '../../db/tipos';
import { errores, esDuplicado } from '../../lib/errores';
import { fechaLarga } from '../../lib/fechas';
import { htmlATexto, sanitizarContenido, tieneContenido, uuidsEnLinea } from '../../lib/sanitizar';
import { validar } from '../../lib/validar';
import { borrarGuardados, procesarArchivos, type ArchivoGuardado } from '../adjuntos/almacenamiento';
import { insertarAdjuntos, vincularEnLinea } from '../adjuntos/servicio';
import { obtenerAjustes } from '../ajustes/servicio';
import { nombreVisible, type UsuarioActual } from '../auth/contexto';
import { CODIGOS_PLANTILLA, encolarCorreo } from '../correos/cola';
import { escaparHtml, type Variables } from '../correos/plantillas';
import { registrarEvento, TIPOS_EVENTO, type TipoEvento } from '../eventos/servicio';
import { empresasDe, puedeVerTicket } from './acceso';
import { siguienteFolio } from './folio';
import { notificarNuevoTicket, notificarSolicitante } from '../notificaciones/servicio';

const urlTicket = (id: number) => `${env.APP_URL.replace(/\/$/, '')}/tickets/${id}`;

/** Variables de plantilla para un ticket (con los nombres de sus catálogos). */
async function variablesTicket(tx: Tx, ticketId: number): Promise<{ vars: Variables; solicitante: Destinatario }> {
  const t = await tx
    .selectFrom('tickets as t')
    .innerJoin('tipos_solicitud as ti', 'ti.id', 't.tipo_id')
    .innerJoin('departamentos as dp', 'dp.id', 't.departamento_id')
    .innerJoin('empresas as e', 'e.id', 't.empresa_id')
    .leftJoin('modulos as m', 'm.id', 't.modulo_id')
    .innerJoin('usuarios as s', 's.id', 't.solicitante_id')
    .select([
      'dp.nombre as departamento',
      't.id',
      't.folio',
      't.concepto',
      't.folios_ref',
      't.estatus',
      't.urgencia',
      't.creado_at',
      't.descripcion_html',
      'ti.nombre as tipo',
      'e.nombre as empresa',
      'm.nombre as modulo',
      's.username',
      's.nombre',
      's.email',
      's.activo',
      's.eliminado_at',
    ])
    .where('t.id', '=', ticketId)
    .executeTakeFirstOrThrow();
  const nombre = nombreVisible(t);
  return {
    vars: {
      folio: t.folio,
      departamento: t.departamento,
      urgencia: INFO_URGENCIA[t.urgencia].nombre,
      tipo: t.tipo,
      empresa: t.empresa,
      modulo: t.modulo,
      concepto: t.concepto,
      folios: t.folios_ref,
      estatus: INFO_ESTATUS[t.estatus as Estatus]?.nombre ?? t.estatus,
      solicitante: nombre,
      solicitante_email: t.email,
      fecha: fechaLarga(t.creado_at),
      url_ticket: urlTicket(t.id),
      descripcion_html: t.descripcion_html,
    },
    // A un usuario dado de baja ya no se le envían correos.
    solicitante: t.activo && !t.eliminado_at ? { email: t.email, nombre } : { email: '' },
  };
}

// ============================================================== Crear

export async function crearTicket(u: UsuarioActual, entrada: unknown, archivos: Express.Multer.File[]): Promise<TicketCreado> {
  const d = validar(esquemaTicketCrear, entrada);
  const campos: Record<string, string> = {};

  const tipo = await db.selectFrom('tipos_solicitud').selectAll().where('id', '=', d.tipoId).where('activo', '=', 1).executeTakeFirst();
  if (!tipo) throw errores.validacion('Selecciona un tipo de solicitud válido.', { tipoId: 'Selecciona un tipo de solicitud válido.' });
  const empresa = await db.selectFrom('empresas').selectAll().where('id', '=', d.empresaId).where('activa', '=', 1).executeTakeFirst();
  if (!empresa) campos.empresaId = 'Selecciona una empresa válida.';
  // El departamento forma el folio: VEN-0001. Quien no es de soporte y tiene un departamento asignado (activo)
  // siempre crea con el suyo, aunque mande otro; si no tiene uno, lo elige. Soporte elige cualquiera.
  const propio = u.permisos.has(PERMISOS.TICKETS_VER_TODOS)
    ? undefined
    : await db
        .selectFrom('usuarios as us')
        .innerJoin('departamentos as dp', 'dp.id', 'us.departamento_id')
        .select(['dp.id', 'dp.codigo'])
        .where('us.id', '=', u.id)
        .where('dp.activo', '=', 1)
        .executeTakeFirst();
  const departamento =
    propio ??
    (await db
      .selectFrom('departamentos')
      .select(['id', 'codigo'])
      .where('id', '=', d.departamentoId)
      .where('activo', '=', 1)
      .executeTakeFirst());
  if (!departamento) campos.departamentoId = 'Selecciona el departamento.';

  let moduloId: number | null = null;
  if (d.moduloId) {
    const m = await db.selectFrom('modulos').select('id').where('id', '=', d.moduloId).where('activo', '=', 1).executeTakeFirst();
    if (!m) campos.moduloId = 'Selecciona un módulo válido.';
    else moduloId = m.id;
  } else if (tipo.requiere_modulo) campos.moduloId = 'Selecciona el módulo.';
  if (tipo.requiere_concepto && !d.concepto) campos.concepto = 'Escribe el concepto.';
  if (tipo.requiere_folios && !d.foliosRef) campos.foliosRef = 'Escribe el folio o folios relacionados.';

  const descripcionHtml = sanitizarContenido(d.descripcionHtml);
  if (!tieneContenido(descripcionHtml)) campos.descripcionHtml = 'Escribe la descripción detallada.';

  // Solicitante: normalmente quien crea; a nombre de otro solo con permiso.
  let solicitanteId = u.id;
  if (d.solicitanteId && d.solicitanteId !== u.id) {
    if (!u.permisos.has(PERMISOS.TICKETS_CREAR_A_NOMBRE_DE)) throw errores.prohibido('No puedes crear tickets a nombre de otra persona.');
    const s = await db
      .selectFrom('usuarios')
      .select('id')
      .where('id', '=', d.solicitanteId)
      .where('activo', '=', 1)
      .where('eliminado_at', 'is', null)
      .executeTakeFirst();
    if (!s) campos.solicitanteId = 'El solicitante no existe o está inactivo.';
    else solicitanteId = s.id;
  }

  // La empresa debe estar asignada al solicitante (un admin creando a su nombre puede usar cualquiera).
  if (empresa && !(solicitanteId === u.id && u.permisos.has(PERMISOS.TICKETS_VER_TODOS))) {
    const asignadas = await empresasDe(solicitanteId);
    if (!asignadas.has(empresa.id)) campos.empresaId = 'Esa empresa no está asignada al solicitante.';
  }
  if (Object.keys(campos).length) throw errores.validacion(Object.values(campos)[0]!, campos);

  // "Enviar copia a": usuarios del sistema o correos libres (DECISIONES P3).
  const copias: { usuario_id: number | null; email: string; nombre: string | null }[] = [];
  const idsCopia = d.copias.flatMap((c) => ('usuarioId' in c ? [c.usuarioId] : []));
  if (idsCopia.length) {
    const us = await db
      .selectFrom('usuarios')
      .select(['id', 'email', 'username', 'nombre'])
      .where('id', 'in', idsCopia)
      .where('activo', '=', 1)
      .where('eliminado_at', 'is', null)
      .execute();
    if (us.length !== new Set(idsCopia).size) throw errores.validacion('Algún contacto en copia ya no existe.', { copias: 'Algún contacto en copia ya no existe.' });
    for (const x of us) copias.push({ usuario_id: x.id, email: x.email.toLowerCase(), nombre: nombreVisible(x) });
  }
  for (const c of d.copias) if ('email' in c) copias.push({ usuario_id: null, email: c.email, nombre: c.nombre ?? null });
  const unicas = [...new Map(copias.map((c) => [c.email, c])).values()];

  const guardados = await procesarArchivos(archivos);
  try {
    return await db.transaction().execute(async (tx) => {
      let ticketId = 0;
      let folio = '';
      // Si un folio ya existe (p. ej. importado del sistema anterior) se toma el siguiente.
      for (let intento = 0; intento < 20 && !ticketId; intento++) {
        folio = await siguienteFolio(tx, departamento!.codigo);
        // En PostgreSQL un error invalida toda la transacción: el punto de guardado permite descartar
        // solo el INSERT fallido y seguir con el siguiente folio.
        await sql`SAVEPOINT folio_libre`.execute(tx);
        try {
          const r = await tx
            .insertInto('tickets')
            .values({
              folio,
              departamento_id: departamento!.id,
              tipo_id: tipo.id,
              empresa_id: empresa!.id,
              modulo_id: moduloId,
              concepto: d.concepto,
              folios_ref: d.foliosRef,
              descripcion_html: descripcionHtml,
              descripcion_texto: htmlATexto(descripcionHtml).slice(0, 60_000),
              estatus: ESTATUS.PENDIENTE,
              urgencia: d.urgencia,
              solicitante_id: solicitanteId,
              creado_por_id: u.id,
              asignado_a_id: null,
              cerrado_por_id: null,
              id_anterior: null,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          ticketId = r.id;
          await sql`RELEASE SAVEPOINT folio_libre`.execute(tx);
        } catch (e) {
          if (!esDuplicado(e)) throw e;
          await sql`ROLLBACK TO SAVEPOINT folio_libre`.execute(tx);
        }
      }
      if (!ticketId) throw new Error(`No se pudo asignar un folio libre para ${departamento!.codigo}`);

      if (unicas.length) await tx.insertInto('ticket_copias').values(unicas.map((c) => ({ ...c, ticket_id: ticketId }))).execute();
      await insertarAdjuntos(tx, guardados, { ticketId, mensajeId: null, subidoPorId: u.id, enLinea: false });
      await vincularEnLinea(tx, uuidsEnLinea(descripcionHtml), { ticketId, mensajeId: null, usuarioId: u.id });

      const { vars, solicitante } = await variablesTicket(tx, ticketId);
      let correos = 0;
      if (await encolarCorreo(tx, { plantilla: CODIGOS_PLANTILLA.TICKET_CREADO, para: [solicitante], cc: unicas.map((c) => ({ email: c.email, nombre: c.nombre ?? undefined })), variables: vars, ticketId })) correos++;
      const ajustes = await obtenerAjustes();
      const soporte = ajustes['correo.aviso_soporte_activo'] ? await destinatariosSoporte(tx, ajustes['correo.aviso_soporte_destino']) : [];
      if (soporte.length) {
        if (
          await encolarCorreo(tx, {
            plantilla: CODIGOS_PLANTILLA.TICKET_NUEVO_SOPORTE,
            para: soporte,
            variables: { ...vars, copias: unicas.map((c) => c.email).join(', ') },
            ticketId,
          })
        )
          correos++;
      }

      await notificarNuevoTicket(tx, { id: ticketId, folio, creadoPorId: u.id, urgencia: d.urgencia, tipo: tipo.nombre });

      await registrarEvento(tx, {
        ticketId,
        actorId: u.id,
        tipo: TIPOS_EVENTO.CREADO,
        estatusDespues: ESTATUS.PENDIENTE,
        datos: {
          folio,
          urgencia: d.urgencia,
          adjuntos: guardados.length,
          copias: unicas.map((c) => c.email),
          correosEncolados: correos,
          ...(solicitanteId !== u.id ? { aNombreDe: solicitanteId } : {}),
        },
      });
      return { id: ticketId, folio, correosEncolados: correos };
    });
  } catch (e) {
    await borrarGuardados(guardados);
    throw e;
  }
}

// ============================================================== Acciones

interface Contexto {
  tx: Tx;
  t: Ticket;
  estatusNuevo: Estatus;
  ahora: Date;
}

/**
 * Ejecuta una acción de la máquina de estados con el ticket bloqueado.
 * `version`: si viene, debe coincidir (evita pisar cambios que el usuario no vio).
 */
async function conTicket<T>(
  u: UsuarioActual,
  ticketId: number,
  accion: Accion,
  version: number | undefined,
  hacer: (c: Contexto) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    const t = await tx.selectFrom('tickets').selectAll().where('id', '=', ticketId).forUpdate().executeTakeFirst();
    const empresas = u.permisos.has(PERMISOS.TICKETS_VER_EMPRESA) ? await empresasDe(u.id) : undefined;
    if (!t || !puedeVerTicket(u, t, empresas)) throw errores.noEncontrado('El ticket no existe.');

    const r = validarAccion(accion, { estatus: t.estatus as Estatus, solicitanteId: t.solicitante_id, asignadoAId: t.asignado_a_id }, u);
    if (!r.ok) {
      if (r.codigo === 'SIN_PERMISO') throw errores.prohibido(r.mensaje);
      throw errores.conflicto(r.mensaje, r.codigo);
    }
    if (version !== undefined && version !== t.version) {
      throw errores.conflicto('El ticket cambió mientras lo veías. Se actualizó la información; revisa y vuelve a intentar.', 'VERSION');
    }
    return hacer({ tx, t, estatusNuevo: r.estatusNuevo, ahora: new Date() });
  });
}

async function guardarMensaje(
  c: Contexto,
  u: UsuarioActual,
  tipo: TipoMensaje,
  html: string,
  guardados: ArchivoGuardado[],
): Promise<number> {
  const r = await c.tx
    .insertInto('ticket_mensajes')
    .values({ ticket_id: c.t.id, autor_id: u.id, tipo, cuerpo_html: html, cuerpo_texto: htmlATexto(html).slice(0, 60_000) })
    .returning('id').executeTakeFirstOrThrow();
  const mensajeId = r.id;
  await insertarAdjuntos(c.tx, guardados, { ticketId: c.t.id, mensajeId, subidoPorId: u.id, enLinea: false });
  await vincularEnLinea(c.tx, uuidsEnLinea(html), { ticketId: c.t.id, mensajeId, usuarioId: u.id });
  return mensajeId;
}

async function actualizar(c: Contexto, cambios: CambioTicket) {
  await c.tx
    .updateTable('tickets')
    .set({ ...cambios, version: c.t.version + 1 })
    .where('id', '=', c.t.id)
    .where('version', '=', c.t.version)
    .execute();
}

/** Qué se le avisa al solicitante (campana) en cada acción de soporte. */
function mensajeParaSolicitante(tipo: TipoEvento, folio: string, u: UsuarioActual, datos?: Record<string, unknown>): string | null {
  const quien = nombreVisible(u);
  switch (tipo) {
    case TIPOS_EVENTO.TOMADO:
      return `${quien} tomó tu ticket ${folio}`;
    case TIPOS_EVENTO.RESPONDIDO:
      return `Soporte respondió tu ticket ${folio}`;
    case TIPOS_EVENTO.PAUSADO:
      return `Tu ticket ${folio} se pausó${datos?.motivo ? `: ${String(datos.motivo)}` : ''}`;
    case TIPOS_EVENTO.REANUDADO:
      return `Tu ticket ${folio} se reanudó`;
    case TIPOS_EVENTO.REASIGNADO:
      return `Tu ticket ${folio} se reasignó a otro técnico`;
    case TIPOS_EVENTO.CERRADO:
      return `Tu ticket ${folio} fue cerrado`;
    case TIPOS_EVENTO.NO_PROCEDE:
      return `Tu ticket ${folio} no procede${datos?.motivo ? `: ${String(datos.motivo)}` : ''}`;
    case TIPOS_EVENTO.REABIERTO:
      return `Tu ticket ${folio} se reabrió`;
    default:
      return null;
  }
}

async function evento(c: Contexto, u: UsuarioActual, tipo: TipoEvento, datos?: Record<string, unknown>) {
  await registrarEvento(c.tx, {
    ticketId: c.t.id,
    actorId: u.id,
    tipo,
    estatusAntes: c.t.estatus,
    estatusDespues: c.estatusNuevo,
    datos: datos ?? null,
  });
  // Ticket contestado/actualizado → notificación al solicitante (en la misma transacción).
  const mensaje = mensajeParaSolicitante(tipo, c.t.folio, u, datos);
  if (mensaje) await notificarSolicitante(c.tx, { id: c.t.id, solicitanteId: c.t.solicitante_id }, u.id, mensaje);
}

function htmlDeMensaje(entrada: string, campo: string, mensajeVacio: string): string {
  const html = sanitizarContenido(entrada);
  if (!tieneContenido(html)) throw errores.validacion(mensajeVacio, { [campo]: mensajeVacio });
  return html;
}

/** Guarda archivos, corre la acción y, si falla, borra los archivos ya movidos. */
async function conArchivos<T>(archivos: Express.Multer.File[], hacer: (g: ArchivoGuardado[]) => Promise<T>): Promise<T> {
  const guardados = await procesarArchivos(archivos);
  try {
    return await hacer(guardados);
  } catch (e) {
    await borrarGuardados(guardados);
    throw e;
  }
}

export async function tomar(u: UsuarioActual, id: number) {
  await conTicket(u, id, 'tomar', undefined, async (c) => {
    // Doble seguro además del FOR UPDATE: solo actualiza si sigue pendiente y sin técnico.
    const r = await c.tx
      .updateTable('tickets')
      .set({ asignado_a_id: u.id, estatus: c.estatusNuevo, tomado_at: c.ahora, version: c.t.version + 1 })
      .where('id', '=', id)
      .where('estatus', '=', ESTATUS.PENDIENTE)
      .where('asignado_a_id', 'is', null)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) !== 1) throw errores.conflicto('Otro técnico ya tomó este ticket.', 'YA_ASIGNADO');
    await evento(c, u, TIPOS_EVENTO.TOMADO);
  });
}

export async function pausar(u: UsuarioActual, id: number, entrada: unknown) {
  const d = validar(esquemaPausar, entrada);
  await conTicket(u, id, 'pausar', d.version, async (c) => {
    await actualizar(c, { estatus: c.estatusNuevo, pausado_at: c.ahora });
    await evento(c, u, TIPOS_EVENTO.PAUSADO, { motivo: d.motivo });
  });
}

export async function reanudar(u: UsuarioActual, id: number, entrada: unknown) {
  const d = validar(esquemaVersion, entrada);
  await conTicket(u, id, 'reanudar', d.version, async (c) => {
    await actualizar(c, { estatus: c.estatusNuevo, pausado_at: null });
    await evento(c, u, TIPOS_EVENTO.REANUDADO);
  });
}

export async function reasignar(u: UsuarioActual, id: number, entrada: unknown) {
  const d = validar(esquemaReasignar, entrada);
  await conTicket(u, id, 'reasignar', d.version, async (c) => {
    if (d.asignadoAId === c.t.asignado_a_id) throw errores.validacion('El ticket ya está asignado a ese técnico.');
    const tecnico = await c.tx
      .selectFrom('usuarios as us')
      .innerJoin('rol_permisos as rp', 'rp.rol_id', 'us.rol_id')
      .innerJoin('permisos as p', 'p.id', 'rp.permiso_id')
      .select('us.id')
      .where('us.id', '=', d.asignadoAId)
      .where('p.codigo', '=', PERMISOS.TICKETS_ATENDER)
      .where('us.activo', '=', 1)
      .where('us.eliminado_at', 'is', null)
      .executeTakeFirst();
    if (!tecnico) throw errores.validacion('Selecciona un técnico activo.', { asignadoAId: 'Selecciona un técnico activo.' });
    await actualizar(c, { asignado_a_id: d.asignadoAId });
    await evento(c, u, TIPOS_EVENTO.REASIGNADO, { de: c.t.asignado_a_id, a: d.asignadoAId });
  });
}

export async function responder(u: UsuarioActual, id: number, entrada: unknown, archivos: Express.Multer.File[]) {
  const d = validar(esquemaMensaje, entrada);
  const html = htmlDeMensaje(d.html, 'html', 'Escribe la respuesta.');
  await conArchivos(archivos, (guardados) =>
    conTicket(u, id, 'responder', undefined, async (c) => {
      const mensajeId = await guardarMensaje(c, u, 'RESPUESTA', html, guardados);
      await actualizar(c, c.t.primera_respuesta_at ? {} : { primera_respuesta_at: c.ahora });
      await evento(c, u, TIPOS_EVENTO.RESPONDIDO, { mensajeId, adjuntos: guardados.length });

      const ajustes = await obtenerAjustes();
      if (ajustes['correo.respuestas_activas']) {
        const { vars, solicitante } = await variablesTicket(c.tx, id);
        await encolarCorreo(c.tx, {
          plantilla: CODIGOS_PLANTILLA.TICKET_RESPUESTA,
          para: [solicitante],
          variables: { ...vars, tecnico: nombreVisible(u), mensaje_html: html },
          ticketId: id,
        });
      }
    }),
  );
}

export async function comentar(u: UsuarioActual, id: number, entrada: unknown, archivos: Express.Multer.File[]) {
  const d = validar(esquemaMensaje, entrada);
  const html = sanitizarContenido(d.html);
  if (!tieneContenido(html) && !archivos.length) throw errores.validacion('Escribe un comentario o adjunta un archivo.', { html: 'Escribe un comentario o adjunta un archivo.' });
  await conArchivos(archivos, (guardados) =>
    conTicket(u, id, 'comentar', undefined, async (c) => {
      const mensajeId = await guardarMensaje(c, u, 'COMENTARIO', html || '<p></p>', guardados);
      await actualizar(c, {});
      await evento(c, u, guardados.length && !tieneContenido(html) ? TIPOS_EVENTO.ADJUNTO_AGREGADO : TIPOS_EVENTO.COMENTADO, {
        mensajeId,
        adjuntos: guardados.length,
      });
    }),
  );
}

/**
 * Quién recibe los avisos a soporte (ticket nuevo y cierre): todos los admins activos (quienes ven la
 * bandeja de soporte), incluido quien hizo la acción, más los correos extra de Ajustes → Correos.
 * Sin repetir correos.
 */
async function destinatariosSoporte(tx: Tx, extra: string): Promise<Destinatario[]> {
  const admins = await tx
    .selectFrom('usuarios as u')
    .innerJoin('rol_permisos as rp', 'rp.rol_id', 'u.rol_id')
    .innerJoin('permisos as p', 'p.id', 'rp.permiso_id')
    .select(['u.email', 'u.nombre', 'u.username'])
    .where('p.codigo', '=', PERMISOS.TICKETS_VER_TODOS)
    .where('u.activo', '=', 1)
    .where('u.eliminado_at', 'is', null)
    .orderBy('u.id')
    .execute();
  const lista: Destinatario[] = [
    ...admins.map((a) => ({ email: a.email.toLowerCase(), nombre: nombreVisible(a) })),
    ...listaCorreos(extra).map((email) => ({ email: email.toLowerCase() })),
  ];
  return [...new Map(lista.map((d) => [d.email, d])).values()];
}

/**
 * Correos de cierre (Cerrar y No procede): al solicitante y, si el ajuste está encendido, a soporte.
 * Devuelve si se encoló el del solicitante.
 */
async function correosCierre(c: Contexto, u: UsuarioActual, resolucionHtml: string): Promise<boolean> {
  const { vars, solicitante } = await variablesTicket(c.tx, c.t.id);
  const variables = { ...vars, tecnico: nombreVisible(u), fecha_cierre: fechaLarga(c.ahora), resolucion_html: resolucionHtml };
  const encolado = await encolarCorreo(c.tx, { plantilla: CODIGOS_PLANTILLA.TICKET_CERRADO, para: [solicitante], variables, ticketId: c.t.id });
  const ajustes = await obtenerAjustes();
  const soporte = ajustes['correo.aviso_cierre_activo'] ? await destinatariosSoporte(c.tx, ajustes['correo.aviso_soporte_destino']) : [];
  if (soporte.length) {
    await encolarCorreo(c.tx, { plantilla: CODIGOS_PLANTILLA.TICKET_CERRADO_SOPORTE, para: soporte, variables, ticketId: c.t.id });
  }
  return encolado;
}

export async function cerrar(u: UsuarioActual, id: number, entrada: unknown, archivos: Express.Multer.File[]) {
  const d = validar(esquemaCerrar, entrada);
  const html = htmlDeMensaje(d.resolucionHtml, 'resolucionHtml', 'La resolución es obligatoria para cerrar el ticket.');
  await conArchivos(archivos, (guardados) =>
    conTicket(u, id, 'cerrar', d.version, async (c) => {
      const mensajeId = await guardarMensaje(c, u, 'RESOLUCION', html, guardados);
      await actualizar(c, {
        estatus: c.estatusNuevo,
        cerrado_at: c.ahora,
        cerrado_por_id: u.id,
        pausado_at: null,
        ...(c.t.primera_respuesta_at ? {} : { primera_respuesta_at: c.ahora }),
      });
      const encolado = await correosCierre(c, u, html);
      await evento(c, u, TIPOS_EVENTO.CERRADO, { mensajeId, adjuntos: guardados.length, correoEncolado: encolado });
    }),
  );
}

/** Cierra un ticket abierto como "No procede". El motivo queda como resolución visible para el solicitante. */
export async function noProcede(u: UsuarioActual, id: number, entrada: unknown) {
  const d = validar(esquemaNoProcede, entrada);
  const html = `<p><strong>No procede:</strong> ${escaparHtml(d.motivo)}</p>`;
  await conTicket(u, id, 'noProcede', d.version, async (c) => {
    const mensajeId = await guardarMensaje(c, u, 'RESOLUCION', html, []);
    await actualizar(c, { estatus: c.estatusNuevo, cerrado_at: c.ahora, cerrado_por_id: u.id, pausado_at: null });
    const encolado = await correosCierre(c, u, html);
    await evento(c, u, TIPOS_EVENTO.NO_PROCEDE, { motivo: d.motivo, mensajeId, correoEncolado: encolado });
  });
}

export async function reabrir(u: UsuarioActual, id: number, entrada: unknown) {
  const d = validar(esquemaVersion, entrada);
  await conTicket(u, id, 'reabrir', d.version, async (c) => {
    await actualizar(c, { estatus: c.estatusNuevo, cerrado_at: null, cerrado_por_id: null });
    await evento(c, u, TIPOS_EVENTO.REABIERTO);
  });
}

