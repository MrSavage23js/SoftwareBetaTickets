import { sql, type Expression, type SelectQueryBuilder, type SqlBool } from 'kysely';
import {
  LISTA_ESTATUS,
  PERMISOS,
  accionesDisponibles,
  esquemaListarTickets,
  type ContadoresEstatus,
  type Estatus,
  type EventoInfo,
  type ListarTicketsEntrada,
  type Paginado,
  type TicketDetalle,
  type TicketResumen,
  type UsuarioRef,
  leerApariencia,
} from '@mesa/shared';
import { db } from '../../db/conexion';
import type { BD } from '../../db/tipos';
import { coincide, escaparLike } from '../../lib/buscar';
import { errores } from '../../lib/errores';
import { finDiaLocal, inicioDiaLocal } from '../../lib/fechas';
import { validar } from '../../lib/validar';
import { aInfo } from '../adjuntos/servicio';
import { nombreVisible, type UsuarioActual } from '../auth/contexto';
import { empresasDe, filtroVisibles, puedeVerTicket } from './acceso';

/** Persona tal como la ve la web: nombre visible y el avatar que eligió en Apariencia (si se pasa su apariencia). */
const ref = (id: number | null, username: string | null, nombre: string | null, apariencia?: unknown): UsuarioRef | null =>
  id === null || username === null
    ? null
    : { id, username, nombre: nombreVisible({ username, nombre }), ...(apariencia !== undefined ? { avatar: leerApariencia(apariencia).avatar } : {}) };

type Base = SelectQueryBuilder<
  BD & { t: BD['tickets']; dp: BD['departamentos']; ti: BD['tipos_solicitud']; e: BD['empresas']; m: BD['modulos']; s: BD['usuarios']; a: BD['usuarios'] },
  't' | 'dp' | 'ti' | 'e' | 'm' | 's' | 'a',
  object
>;

function base(): Base {
  return db
    .selectFrom('tickets as t')
    .innerJoin('departamentos as dp', 'dp.id', 't.departamento_id')
    .innerJoin('tipos_solicitud as ti', 'ti.id', 't.tipo_id')
    .innerJoin('empresas as e', 'e.id', 't.empresa_id')
    .leftJoin('modulos as m', 'm.id', 't.modulo_id')
    .innerJoin('usuarios as s', 's.id', 't.solicitante_id')
    .leftJoin('usuarios as a', 'a.id', 't.asignado_a_id') as unknown as Base;
}

/**
 * Convierte la búsqueda libre en una consulta de texto completo de PostgreSQL: cada palabra es obligatoria
 * y se busca como prefijo ("invent" encuentra "inventario"). Solo letras y números, así que no hay
 * caracteres especiales de tsquery que escapar.
 */
function consultaFulltext(q: string): string | null {
  const palabras = q
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3)
    .slice(0, 8);
  return palabras.length ? palabras.map((p) => `${p}:*`).join(' & ') : null;
}

/** Tickets cuyo texto (concepto, folio(s), descripción) contiene todas las palabras. Usa el índice GIN. */
const textoCompleto = (consulta: string) => sql<SqlBool>`t.busqueda @@ to_tsquery('simple', f_unaccent(${consulta}))`;

/** Consultas solo sobre `tickets` (sin uniones): para contar y paginar. Los filtros solo usan columnas de t. */
type SoloTickets = SelectQueryBuilder<BD & { t: BD['tickets'] }, 't', object>;
const soloTickets = () => db.selectFrom('tickets as t') as unknown as SoloTickets;

interface Busqueda {
  texto: string;
  like: string;
  usuarios: number[];
  empresas: number[];
  /** El texto tiene palabras que busca el índice de texto completo. */
  hayPalabras: boolean;
  /** Coincidencias de texto completo resueltas aparte (dentro de un OR grande el índice rinde menos). */
  fulltext: number[];
  /** Consulta de texto completo; se usa directo si hubo demasiadas coincidencias para la lista de ids. */
  expresionFulltext: string | null;
  fulltextTruncado: boolean;
}

const MAX_FULLTEXT = 5000;

async function prepararBusqueda(q: string | undefined, u: UsuarioActual): Promise<Busqueda | null> {
  if (!q?.trim()) return null;
  const texto = q.trim();
  const like = `%${escaparLike(texto)}%`;
  const ft = consultaFulltext(texto);
  // Usuarios y empresas son tablas pequeñas: se resuelven primero y se filtra por id (usa índices de tickets).
  const [usuarios, empresas, fulltext] = await Promise.all([
    db
      .selectFrom('usuarios')
      .select('id')
      .where((eb) => eb.or([coincide('username', like), coincide('nombre', like)]))
      .limit(200)
      .execute(),
    db.selectFrom('empresas').select('id').where(coincide('nombre', like)).execute(),
    ft
      ? soloTickets()
          .select('t.id')
          // Solo entre los tickets que el usuario puede ver: el tope nunca deja fuera los suyos.
          .where(filtroVisibles(u) as never)
          .where(textoCompleto(ft))
          .limit(MAX_FULLTEXT)
          .execute()
      : Promise.resolve([]),
  ]);
  return {
    texto,
    like,
    hayPalabras: ft !== null,
    usuarios: usuarios.map((x) => x.id),
    empresas: empresas.map((x) => x.id),
    fulltext: fulltext.map((x) => x.id),
    expresionFulltext: ft,
    fulltextTruncado: fulltext.length >= MAX_FULLTEXT,
  };
}

function aplicarFiltros(
  q: SoloTickets,
  u: UsuarioActual,
  f: ReturnType<typeof filtrosValidados>,
  conEstatus: boolean,
  b: Busqueda | null,
): SoloTickets {
  q = q.where(filtroVisibles(u) as never);
  if (conEstatus && f.estatus) q = q.where('t.estatus', '=', f.estatus);
  if (f.departamentoId) q = q.where('t.departamento_id', '=', f.departamentoId);
  if (f.urgencia) q = q.where('t.urgencia', '=', f.urgencia);
  if (f.tipoId) q = q.where('t.tipo_id', '=', f.tipoId);
  if (f.empresaId) q = q.where('t.empresa_id', '=', f.empresaId);
  if (f.moduloId) q = q.where('t.modulo_id', '=', f.moduloId);
  if (f.solicitanteId) q = q.where('t.solicitante_id', '=', f.solicitanteId);
  if (f.asignadoAId === 'ninguno') q = q.where('t.asignado_a_id', 'is', null);
  else if (f.asignadoAId) q = q.where('t.asignado_a_id', '=', f.asignadoAId);
  if (f.desde) q = q.where('t.creado_at', '>=', inicioDiaLocal(f.desde));
  if (f.hasta) q = q.where('t.creado_at', '<', finDiaLocal(f.hasta));

  if (b) {
    q = q.where((eb) => {
      const o: Expression<SqlBool>[] = [eb('t.folio', 'like', `${escaparLike(b.texto.toUpperCase())}%`)];
      // Concepto y folio(s) están en el índice de texto completo. El LIKE (que recorre toda la tabla) solo se usa
      // cuando el texto no tiene palabras indexables (menos de 3 caracteres, p. ej. "B1").
      if (!b.hayPalabras) o.push(coincide('t.folios_ref', b.like), coincide('t.concepto', b.like));
      if (b.usuarios.length) o.push(eb('t.solicitante_id', 'in', b.usuarios));
      if (b.empresas.length) o.push(eb('t.empresa_id', 'in', b.empresas));
      if (b.fulltextTruncado && b.expresionFulltext) {
        // Palabra muy común (más coincidencias que el tope): consulta completa, más lenta pero sin perder resultados.
        o.push(textoCompleto(b.expresionFulltext));
      } else if (b.fulltext.length) {
        o.push(eb('t.id', 'in', b.fulltext));
      }
      return eb.or(o);
    });
  }
  return q;
}

function filtrosValidados(entrada: ListarTicketsEntrada | Record<string, unknown>) {
  return validar(esquemaListarTickets, entrada);
}

export async function listarTickets(
  u: UsuarioActual,
  entrada: Record<string, unknown>,
): Promise<Paginado<TicketResumen> & { contadores: ContadoresEstatus }> {
  const f = filtrosValidados(entrada);
  const busqueda = await prepararBusqueda(f.q, u);
  const dir = f.orden === 'antiguos' ? 'asc' : 'desc';
  // "urgencia": crítica arriba (el tipo urgencia_ticket está ordenado de baja a crítica), luego los más recientes.
  const porUrgencia = f.orden === 'urgencia';

  // 1) Página de ids y contadores, solo sobre `tickets` (usa índices; sin uniones).
  // 2) Las uniones con catálogos y usuarios se hacen después, solo para los ids de la página.
  const [pagina, conteos] = await Promise.all([
    (porUrgencia
      ? aplicarFiltros(soloTickets(), u, f, true, busqueda).select('t.id').orderBy('t.urgencia', 'desc')
      : aplicarFiltros(soloTickets(), u, f, true, busqueda).select('t.id'))
      .orderBy('t.creado_at', dir)
      .orderBy('t.id', dir)
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina)
      .execute(),
    aplicarFiltros(soloTickets(), u, f, false, busqueda)
      .select(['t.estatus', sql<number>`COUNT(*)`.as('n')])
      .groupBy('t.estatus')
      .execute(),
  ]);
  const ids = pagina.map((p) => p.id);
  const orden = new Map(ids.map((id, i) => [id, i]));

  const filas = await (ids.length ? base().where('t.id', 'in', ids) : base().where(sql<SqlBool>`FALSE`))
      .select([
        't.id',
        't.folio',
        't.estatus',
        't.urgencia',
        't.concepto',
        't.creado_at',
        'dp.id as dp_id',
        'dp.nombre as dp_nombre',
        'ti.id as tipo_id',
        'ti.nombre as tipo_nombre',
        'e.id as empresa_id',
        'e.nombre as empresa_nombre',
        'm.id as modulo_id',
        'm.nombre as modulo_nombre',
        's.id as s_id',
        's.username as s_username',
        's.nombre as s_nombre',
        's.apariencia as s_apariencia',
        'a.id as a_id',
        'a.username as a_username',
        'a.nombre as a_nombre',
        'a.apariencia as a_apariencia',
      ])
      .execute();
  filas.sort((x, y) => orden.get(x.id)! - orden.get(y.id)!);

  const contadores: ContadoresEstatus = { total: 0, PENDIENTE: 0, EN_PROCESO: 0, PAUSADO: 0, COMPLETADO: 0, NO_PROCEDE: 0 };
  for (const c of conteos) {
    if ((LISTA_ESTATUS as readonly string[]).includes(c.estatus)) contadores[c.estatus as Estatus] = Number(c.n);
    contadores.total += Number(c.n);
  }

  return {
    datos: filas.map((r) => ({
      id: r.id,
      folio: r.folio,
      estatus: r.estatus as Estatus,
      urgencia: r.urgencia,
      concepto: r.concepto,
      creadoAt: r.creado_at.toISOString(),
      departamento: { id: r.dp_id, nombre: r.dp_nombre },
      tipo: { id: r.tipo_id, nombre: r.tipo_nombre },
      empresa: { id: r.empresa_id, nombre: r.empresa_nombre },
      modulo: r.modulo_id === null ? null : { id: r.modulo_id, nombre: r.modulo_nombre! },
      solicitante: ref(r.s_id, r.s_username, r.s_nombre, r.s_apariencia)!,
      asignado: ref(r.a_id, r.a_username, r.a_nombre, r.a_apariencia),
    })),
    total: f.estatus ? contadores[f.estatus as Estatus] : contadores.total,
    pagina: f.pagina,
    porPagina: f.porPagina,
    contadores,
  };
}

/** Carga un ticket verificando que el usuario lo pueda ver (si no, 404). */
export async function ticketVisible(u: UsuarioActual, id: number) {
  const t = await db.selectFrom('tickets').selectAll().where('id', '=', id).executeTakeFirst();
  if (!t) throw errores.noEncontrado('El ticket no existe.');
  const empresas = u.permisos.has(PERMISOS.TICKETS_VER_EMPRESA) ? await empresasDe(u.id) : undefined;
  if (!puedeVerTicket(u, t, empresas)) throw errores.noEncontrado('El ticket no existe.');
  return t;
}

export async function detalleTicket(u: UsuarioActual, id: number): Promise<TicketDetalle> {
  await ticketVisible(u, id);
  const r = await base()
    .leftJoin('usuarios as c', 'c.id', 't.creado_por_id')
    .leftJoin('usuarios as cp', 'cp.id', 't.cerrado_por_id')
    .selectAll('t')
    .select([
      'dp.nombre as dp_nombre',
      'ti.nombre as tipo_nombre',
      'ti.titulo_detalle',
      'e.nombre as empresa_nombre',
      'm.nombre as modulo_nombre',
      's.username as s_username',
      's.nombre as s_nombre',
      's.apariencia as s_apariencia',
      'a.username as a_username',
      'a.nombre as a_nombre',
      'a.apariencia as a_apariencia',
      'c.username as c_username',
      'c.nombre as c_nombre',
      'cp.username as cp_username',
      'cp.nombre as cp_nombre',
    ])
    .where('t.id', '=', id)
    .executeTakeFirstOrThrow();

  const [copias, adjuntos, mensajes] = await Promise.all([
    db.selectFrom('ticket_copias').select(['email', 'nombre', 'usuario_id']).where('ticket_id', '=', id).orderBy('id').execute(),
    db
      .selectFrom('adjuntos')
      .select(['uuid', 'nombre_original', 'mime', 'tamano_bytes', 'en_linea', 'mensaje_id'])
      .where('ticket_id', '=', id)
      .where('eliminado_at', 'is', null)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('ticket_mensajes as tm')
      .innerJoin('usuarios as au', 'au.id', 'tm.autor_id')
      .select(['tm.id', 'tm.tipo', 'tm.cuerpo_html', 'tm.creado_at', 'au.id as autor_id', 'au.username', 'au.nombre', 'au.apariencia'])
      .where('tm.ticket_id', '=', id)
      .orderBy('tm.creado_at')
      .orderBy('tm.id')
      .execute(),
  ]);

  const visibles = (mensajeId: number | null) =>
    adjuntos.filter((a) => a.mensaje_id === mensajeId && !a.en_linea).map(aInfo);

  return {
    id: r.id,
    folio: r.folio,
    estatus: r.estatus as Estatus,
    urgencia: r.urgencia,
    departamento: { id: r.departamento_id, nombre: r.dp_nombre },
    tipo: { id: r.tipo_id, nombre: r.tipo_nombre },
    tituloDetalle: r.titulo_detalle,
    empresa: { id: r.empresa_id, nombre: r.empresa_nombre },
    modulo: r.modulo_id === null ? null : { id: r.modulo_id, nombre: r.modulo_nombre! },
    concepto: r.concepto,
    foliosRef: r.folios_ref,
    descripcionHtml: r.descripcion_html,
    solicitante: ref(r.solicitante_id, r.s_username, r.s_nombre, r.s_apariencia)!,
    creadoPor: ref(r.creado_por_id, r.c_username, r.c_nombre)!,
    asignado: ref(r.asignado_a_id, r.a_username, r.a_nombre, r.a_apariencia),
    creadoAt: r.creado_at.toISOString(),
    tomadoAt: r.tomado_at?.toISOString() ?? null,
    primeraRespuestaAt: r.primera_respuesta_at?.toISOString() ?? null,
    pausadoAt: r.pausado_at?.toISOString() ?? null,
    cerradoAt: r.cerrado_at?.toISOString() ?? null,
    cerradoPor: ref(r.cerrado_por_id, r.cp_username, r.cp_nombre),
    version: r.version,
    copias: copias.map((c) => ({ email: c.email, nombre: c.nombre, usuarioId: c.usuario_id })),
    adjuntos: visibles(null),
    mensajes: mensajes.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      autor: ref(m.autor_id, m.username, m.nombre, m.apariencia)!,
      esSoporte: m.tipo !== 'COMENTARIO',
      html: m.cuerpo_html,
      creadoAt: m.creado_at.toISOString(),
      adjuntos: visibles(m.id),
    })),
    acciones: accionesDisponibles(
      { estatus: r.estatus as Estatus, solicitanteId: r.solicitante_id, asignadoAId: r.asignado_a_id },
      { id: u.id, permisos: u.permisos },
    ),
  };
}

export async function historialTicket(u: UsuarioActual, id: number): Promise<EventoInfo[]> {
  await ticketVisible(u, id);
  const filas = await db
    .selectFrom('ticket_eventos as ev')
    .leftJoin('usuarios as us', 'us.id', 'ev.actor_id')
    .select(['ev.id', 'ev.tipo', 'ev.estatus_antes', 'ev.estatus_despues', 'ev.datos', 'ev.creado_at', 'us.id as us_id', 'us.username', 'us.nombre'])
    .where('ev.ticket_id', '=', id)
    .orderBy('ev.creado_at')
    .orderBy('ev.id')
    .execute();

  // Los ids de técnicos en "reasignado" se traducen a nombres para mostrarlos.
  const ids = new Set<number>();
  for (const f of filas) {
    const d = f.datos as Record<string, unknown> | null;
    for (const k of ['de', 'a'] as const) if (typeof d?.[k] === 'number') ids.add(d[k] as number);
  }
  const nombres = ids.size
    ? new Map(
        (await db.selectFrom('usuarios').select(['id', 'username', 'nombre']).where('id', 'in', [...ids]).execute()).map((x) => [
          x.id,
          nombreVisible(x),
        ]),
      )
    : new Map<number, string>();

  return filas.map((f) => {
    const datos = (f.datos as Record<string, unknown> | null) ?? null;
    const enriquecidos =
      datos && (typeof datos.de === 'number' || typeof datos.a === 'number')
        ? { ...datos, deNombre: nombres.get(datos.de as number) ?? null, aNombre: nombres.get(datos.a as number) ?? null }
        : datos;
    return {
      id: f.id,
      tipo: f.tipo,
      actor: ref(f.us_id, f.username, f.nombre),
      estatusAntes: (f.estatus_antes as Estatus | null) ?? null,
      estatusDespues: (f.estatus_despues as Estatus | null) ?? null,
      datos: enriquecidos,
      creadoAt: f.creado_at.toISOString(),
    };
  });
}
