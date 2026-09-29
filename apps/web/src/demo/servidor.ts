// =====================================================================================
//  MODO DEMO — servidor simulado dentro del navegador (para GitHub Pages).
//  Responde las mismas rutas que la API real con las mismas formas de datos, reutilizando
//  las reglas de negocio compartidas (máquina de estados, validaciones, permisos) y los
//  catálogos y plantillas iniciales del proyecto. Los datos viven en localStorage del navegador.
//  NO es seguro ni multiusuario: solo sirve para probar las pantallas.
// =====================================================================================
import {
  DEFINICION_AJUSTES,
  ESTATUS,
  INFO_ESTATUS,
  LISTA_ESTATUS,
  PERMISOS,
  PERMISOS_INICIALES,
  accionesDisponibles,
  erroresPorCampo,
  esquemaCambiarPassword,
  esquemaCerrar,
  esquemaEmpresa,
  esquemaListarTickets,
  esquemaLogin,
  esquemaMensaje,
  esquemaModulo,
  esquemaPassword,
  esquemaPausar,
  esquemaPlantilla,
  esquemaReasignar,
  esquemaTicketCrear,
  esquemaTipoSolicitud,
  esquemaUsuarioCrear,
  esquemaUsuarioEditar,
  esquemaVersion,
  formatearFolio,
  prefijoFolio,
  validarAccion,
  type Accion,
  type AdjuntoInfo,
  type ClaveAjuste,
  type Estatus,
  type EventoInfo,
  type TicketDetalle,
  type TicketResumen,
  type UsuarioFila,
  type UsuarioSesion,
} from '@mesa/shared';
import type { z } from 'zod';
// Catálogos y plantillas iniciales del proyecto real (archivos sin dependencias del servidor).
import { EMPRESAS, MODULOS, TIPOS } from '../../../api/src/db/seeds/datos-iniciales';
import { PLANTILLAS } from '../../../api/src/db/seeds/plantillas-iniciales';
import { ErrorCliente } from '../api/cliente';
import { CLAVE_DEMO, PASSWORD_DEMO } from './datos-demo';

// ---------------------------------------------------------------- Modelo
interface UsuarioD {
  id: number;
  username: string;
  nombre: string | null;
  email: string;
  password: string;
  rol: 'USUARIO' | 'ADMIN_SOPORTE';
  empresaIds: number[];
  activo: boolean;
  eliminado: boolean;
  ultimoLoginAt: string | null;
  debeCambiar: boolean;
  creadoAt: string;
}
interface TicketD {
  id: number;
  folio: string;
  tipoId: number;
  empresaId: number;
  moduloId: number | null;
  concepto: string | null;
  foliosRef: string | null;
  descripcionHtml: string;
  estatus: Estatus;
  solicitanteId: number;
  creadoPorId: number;
  asignadoAId: number | null;
  creadoAt: string;
  tomadoAt: string | null;
  primeraRespuestaAt: string | null;
  pausadoAt: string | null;
  cerradoAt: string | null;
  cerradoPorId: number | null;
  version: number;
  copias: { email: string; nombre: string | null; usuarioId: number | null }[];
}
interface MensajeD {
  id: number;
  ticketId: number;
  autorId: number;
  tipo: 'COMENTARIO' | 'RESPUESTA' | 'RESOLUCION';
  html: string;
  creadoAt: string;
}
interface AdjuntoD {
  uuid: string;
  ticketId: number | null;
  mensajeId: number | null;
  nombre: string;
  mime: string;
  tamano: number;
  enLinea: boolean;
}
interface EventoD {
  id: number;
  ticketId: number;
  actorId: number | null;
  tipo: string;
  estatusAntes: Estatus | null;
  estatusDespues: Estatus | null;
  datos: Record<string, unknown> | null;
  creadoAt: string;
}
interface CorreoD {
  id: number;
  plantillaCodigo: string;
  ticketId: number | null;
  para: { email: string; nombre?: string }[];
  asunto: string;
  estado: 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'FALLIDO' | 'CANCELADO';
  intentos: number;
  creadoAt: string;
  enviadoAt: string | null;
}
interface CatalogoD {
  id: number;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  orden: number;
}
interface TipoD extends CatalogoD {
  tituloDetalle: string;
  requiereModulo: boolean;
  requiereConcepto: boolean;
  requiereFolios: boolean;
}
interface PlantillaD {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  asunto: string;
  cuerpoHtml: string;
  variables: { nombre: string; descripcion: string }[];
  activa: boolean;
  actualizadoAt: string;
}
interface Estado {
  version: 1;
  siguiente: number;
  usuarios: UsuarioD[];
  empresas: CatalogoD[];
  tipos: TipoD[];
  modulos: CatalogoD[];
  tickets: TicketD[];
  mensajes: MensajeD[];
  adjuntos: AdjuntoD[];
  eventos: EventoD[];
  correos: CorreoD[];
  plantillas: PlantillaD[];
  ajustes: Record<string, unknown>;
  folios: Record<string, number>;
  sesionUsuarioId: number | null;
}

const CLAVE = CLAVE_DEMO;

// Archivos: solo en memoria (URL de blob). Tras recargar la página ya no se pueden abrir.
const archivos = new Map<string, string>();

// ---------------------------------------------------------------- Datos de ejemplo
function sembrar(): Estado {
  const ahora = Date.now();
  const hace = (horas: number) => new Date(ahora - horas * 3_600_000).toISOString();
  let id = 1;
  const nuevoId = () => id++;
  const empresas = EMPRESAS.map((e, i) => ({ id: nuevoId(), nombre: e.nombre, codigo: e.codigo, activo: true, orden: i + 1 }));
  const tipos = TIPOS.map((t, i) => ({ id: nuevoId(), nombre: t.nombre, codigo: t.codigo, activo: true, orden: i + 1, tituloDetalle: t.tituloDetalle, requiereModulo: t.requiereModulo, requiereConcepto: t.requiereConcepto, requiereFolios: t.requiereFolios }));
  const modulos = MODULOS.map((m, i) => ({ id: nuevoId(), nombre: m.nombre, codigo: m.codigo, activo: true, orden: i + 1 }));
  const emp = (codigo: string) => empresas.find((e) => e.codigo === codigo)!.id;
  const tipo = (codigo: string) => tipos.find((t) => t.codigo === codigo)!;
  const mod = (nombre: string) => modulos.find((m) => m.nombre === nombre)!.id;

  const u = (username: string, nombre: string, rol: UsuarioD['rol'], empresaIds: number[], ultimo: string | null): UsuarioD => ({
    id: nuevoId(),
    username,
    nombre,
    email: `${username}@demo.local`,
    password: PASSWORD_DEMO,
    rol,
    empresaIds,
    activo: true,
    eliminado: false,
    ultimoLoginAt: ultimo,
    debeCambiar: false,
    creadoAt: hace(24 * 60),
  });
  const admin = u('admin', 'Admin Soporte', 'ADMIN_SOPORTE', [], hace(2));
  const tecnico = u('tecnico', 'Pedro Salas', 'ADMIN_SOPORTE', [], hace(5));
  const laura = u('laura', 'Laura Méndez', 'USUARIO', [emp('AS'), emp('MA')], hace(26));
  const pedro = u('pedro', 'Pedro Ramírez', 'USUARIO', [emp('VP')], null);
  const e: Estado = {
    version: 1,
    siguiente: 0,
    usuarios: [admin, tecnico, laura, pedro],
    empresas,
    tipos,
    modulos,
    tickets: [],
    mensajes: [],
    adjuntos: [],
    eventos: [],
    correos: [],
    plantillas: PLANTILLAS.map((p, i) => ({ id: i + 1, codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, asunto: p.asunto, cuerpoHtml: p.cuerpoHtml, variables: p.variables, activa: true, actualizadoAt: hace(24 * 30) })),
    ajustes: Object.fromEntries((Object.keys(DEFINICION_AJUSTES) as ClaveAjuste[]).map((k) => [k, AJUSTES_INICIALES[k]])),
    folios: {},
    sesionUsuarioId: null,
  };
  e.siguiente = id;

  // Tickets de ejemplo en distintos estatus.
  const ejemplos: [string, string, string, number, string, string, string, number, Estatus, UsuarioD | null][] = [
    ['CA', 'AS', 'Compras', laura.id, 'CARTA PORTE', 'B12345', 'Buenos días, me ayudan a cancelar la carta porte B12345: fueron menos cajas.', 1, 'PENDIENTE', null],
    ['CO', 'MA', 'Inventarios', laura.id, 'Ajuste de inventario', 'INV-1024', 'El inventario de la bodega 2 no cuadra con el conteo físico.', 3, 'EN_PROCESO', tecnico],
    ['AC', 'VP', 'Ventas', pedro.id, 'Alta de cliente', '', 'Dar de alta al cliente Comercial del Norte con su RFC.', 8, 'PAUSADO', admin],
    ['CE', 'MA', 'Nómina', laura.id, 'Estructura de departamentos', '', 'Separar el departamento de empaque en dos turnos.', 30, 'COMPLETADO', tecnico],
    ['CG', 'AS', 'Bancos', laura.id, 'Conciliación', '', '¿Cómo concilio los movimientos del banco del mes pasado?', 50, 'COMPLETADO', admin],
    ['MT', 'VP', 'Compras', pedro.id, 'Impresora de etiquetas', '', 'La impresora de etiquetas del almacén no enciende.', 70, 'PENDIENTE', null],
  ];
  for (const [codTipo, codEmp, modulo, solicitante, concepto, folios, texto, horas, estatus, asignado] of ejemplos) {
    const t = tipo(codTipo);
    const prefijo = prefijoFolio(codEmp, t.codigo!);
    e.folios[prefijo] = (e.folios[prefijo] ?? 0) + 1;
    const tk: TicketD = {
      id: nuevoIdE(e),
      folio: formatearFolio(prefijo, e.folios[prefijo]),
      tipoId: t.id,
      empresaId: emp(codEmp),
      moduloId: mod(modulo),
      concepto,
      foliosRef: folios || null,
      descripcionHtml: `<p>${texto}</p>`,
      estatus,
      solicitanteId: solicitante,
      creadoPorId: solicitante,
      asignadoAId: asignado?.id ?? null,
      creadoAt: hace(horas),
      tomadoAt: asignado ? hace(horas - 0.5) : null,
      primeraRespuestaAt: estatus !== 'PENDIENTE' ? hace(horas - 0.7) : null,
      pausadoAt: estatus === 'PAUSADO' ? hace(horas - 1) : null,
      cerradoAt: estatus === 'COMPLETADO' ? hace(horas - 2) : null,
      cerradoPorId: estatus === 'COMPLETADO' ? asignado!.id : null,
      version: 1,
      copias: [],
    };
    e.tickets.push(tk);
    evento(e, tk, solicitante, 'CREADO', null, 'PENDIENTE', { folio: tk.folio }, tk.creadoAt);
    if (asignado) {
      evento(e, tk, asignado.id, 'TOMADO', 'PENDIENTE', 'EN_PROCESO', null, tk.tomadoAt!);
      e.mensajes.push({ id: nuevoIdE(e), ticketId: tk.id, autorId: asignado.id, tipo: 'RESPUESTA', html: '<p>Hola, ya lo estoy revisando.</p>', creadoAt: tk.primeraRespuestaAt! });
      evento(e, tk, asignado.id, 'RESPONDIDO', 'EN_PROCESO', 'EN_PROCESO', null, tk.primeraRespuestaAt!);
    }
    if (estatus === 'PAUSADO') evento(e, tk, asignado!.id, 'PAUSADO', 'EN_PROCESO', 'PAUSADO', { motivo: 'Esperando el RFC del cliente' }, tk.pausadoAt!);
    if (estatus === 'COMPLETADO') {
      e.mensajes.push({ id: nuevoIdE(e), ticketId: tk.id, autorId: asignado!.id, tipo: 'RESOLUCION', html: '<p>Listo, quedó resuelto. Cualquier cosa me avisas.</p>', creadoAt: tk.cerradoAt! });
      evento(e, tk, asignado!.id, 'CERRADO', 'EN_PROCESO', 'COMPLETADO', null, tk.cerradoAt!);
    }
  }
  return e;
}

const AJUSTES_INICIALES: Record<ClaveAjuste, unknown> = {
  'sesion.inactividad_min': 30,
  'sesion.max_horas': 12,
  'login.max_intentos': 5,
  'login.bloqueo_min': 15,
  'password.min_caracteres': 8,
  'adjuntos.max_mb': 10,
  'adjuntos.max_por_mensaje': 5,
  'adjuntos.tipos': ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'xml', 'zip'],
  'correo.respuestas_activas': false,
  'correo.aviso_soporte_activo': false,
  'correo.aviso_soporte_destino': '',
  'kanban.tarjetas_por_columna': 50,
};

// ---------------------------------------------------------------- Persistencia
let cache: Estado | null = null;
function estado(): Estado {
  if (cache) return cache;
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) cache = JSON.parse(guardado) as Estado;
  } catch {
    cache = null;
  }
  if (!cache || cache.version !== 1) cache = sembrar();
  return cache;
}
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cache));
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): la demo sigue funcionando en memoria.
  }
}

function nuevoIdE(e: Estado) {
  return e.siguiente++;
}
function evento(e: Estado, t: TicketD, actorId: number | null, tipo: string, antes: Estatus | null, despues: Estatus | null, datos: Record<string, unknown> | null, fecha = new Date().toISOString()) {
  e.eventos.push({ id: nuevoIdE(e), ticketId: t.id, actorId, tipo, estatusAntes: antes, estatusDespues: despues, datos, creadoAt: fecha });
}

// ---------------------------------------------------------------- Utilidades
const error = (estado: number, codigo: string, mensaje: string, campos?: Record<string, string>) => new ErrorCliente(estado, codigo, mensaje, campos);
function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const campos = erroresPorCampo(r.error);
    throw error(400, 'VALIDACION', Object.values(campos)[0] ?? 'Datos inválidos.', campos);
  }
  return r.data;
}
const nombreVisible = (u: UsuarioD) => u.nombre?.trim() || u.username;
const ref = (e: Estado, id: number | null) => {
  const u = id === null ? undefined : e.usuarios.find((x) => x.id === id);
  return u ? { id: u.id, username: u.username, nombre: nombreVisible(u) } : null;
};
const permisosDe = (u: UsuarioD) => new Set<string>(PERMISOS_INICIALES[u.rol]);

/** Limpieza básica de HTML (en la demo todo ocurre en el navegador de quien escribe). */
function limpiarHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      if (a.name.startsWith('on') || (['href', 'src'].includes(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML.trim();
}
const texto = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
const tieneContenido = (html: string) => texto(html).length > 0 || /<img\s/i.test(html);

function renderizar(plantilla: string, vars: Record<string, string | null | undefined>, html = true) {
  const esc = (s: string) => (html ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : s);
  const valor = (n: string) => vars[n] ?? (n.endsWith('_html') ? '' : '—');
  return plantilla
    .replace(/\{\{\{\s*([a-z0-9_]+)\s*\}\}\}/gi, (_m, n: string) => (n.endsWith('_html') ? valor(n) : esc(valor(n))))
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, n: string) => esc(valor(n)));
}

function encolar(e: Estado, codigo: string, para: UsuarioD | { email: string; nombre?: string }, t: TicketD, extra: Record<string, string> = {}) {
  const p = e.plantillas.find((x) => x.codigo === codigo);
  if (!p?.activa) return false;
  const vars = { folio: t.folio, tipo: e.tipos.find((x) => x.id === t.tipoId)?.nombre ?? '', empresa: e.empresas.find((x) => x.id === t.empresaId)?.nombre ?? '', ...extra };
  e.correos.push({
    id: nuevoIdE(e),
    plantillaCodigo: codigo,
    ticketId: t.id,
    para: [{ email: para.email, nombre: 'username' in para ? nombreVisible(para) : para.nombre }],
    asunto: renderizar(p.asunto, vars, false),
    estado: 'PENDIENTE',
    intentos: 0,
    creadoAt: new Date().toISOString(),
    enviadoAt: null,
  });
  return true;
}

// ---------------------------------------------------------------- Sesión
function actual(e: Estado): UsuarioD {
  const u = e.usuarios.find((x) => x.id === e.sesionUsuarioId && x.activo && !x.eliminado);
  if (!u) throw error(401, 'NO_AUTENTICADO', 'Tu sesión terminó. Inicia sesión de nuevo.');
  return u;
}
function requiere(u: UsuarioD, permiso: string) {
  if (!permisosDe(u).has(permiso)) throw error(403, 'PROHIBIDO', 'No tienes permiso para realizar esta acción.');
}
function sesion(e: Estado, u: UsuarioD): { usuario: UsuarioSesion; csrfToken: string } {
  const a = e.ajustes as Record<ClaveAjuste, never>;
  return {
    csrfToken: 'demo',
    usuario: {
      id: u.id,
      username: u.username,
      nombre: nombreVisible(u),
      email: u.email,
      rol: { codigo: u.rol, nombre: u.rol === 'USUARIO' ? 'Usuario' : 'Admin soporte' },
      permisos: [...permisosDe(u)].sort(),
      empresas: e.empresas.filter((x) => u.empresaIds.includes(x.id) && x.activo).map((x) => ({ id: x.id, nombre: x.nombre })),
      inactividadMin: a['sesion.inactividad_min'],
      debeCambiarPassword: u.debeCambiar,
      adjuntos: { maxMb: a['adjuntos.max_mb'], maxPorMensaje: a['adjuntos.max_por_mensaje'], tipos: a['adjuntos.tipos'] },
    },
  };
}

// ---------------------------------------------------------------- Tickets
function visible(u: UsuarioD, t: TicketD) {
  return permisosDe(u).has(PERMISOS.TICKETS_VER_TODOS) || t.solicitanteId === u.id;
}
function buscarTicket(e: Estado, u: UsuarioD, id: number): TicketD {
  const t = e.tickets.find((x) => x.id === id);
  if (!t || !visible(u, t)) throw error(404, 'NO_ENCONTRADO', 'El ticket no existe.');
  return t;
}
const infoAdjunto = (a: AdjuntoD): AdjuntoInfo => ({ uuid: a.uuid, nombre: a.nombre, mime: a.mime, tamano: a.tamano, enLinea: a.enLinea, url: archivos.get(a.uuid) ?? '#archivo-no-disponible-en-la-demo' });

function resumen(e: Estado, t: TicketD): TicketResumen {
  const m = e.modulos.find((x) => x.id === t.moduloId);
  return {
    id: t.id,
    folio: t.folio,
    estatus: t.estatus,
    tipo: { id: t.tipoId, nombre: e.tipos.find((x) => x.id === t.tipoId)!.nombre },
    empresa: { id: t.empresaId, nombre: e.empresas.find((x) => x.id === t.empresaId)!.nombre },
    modulo: m ? { id: m.id, nombre: m.nombre } : null,
    concepto: t.concepto,
    solicitante: ref(e, t.solicitanteId)!,
    asignado: ref(e, t.asignadoAId),
    creadoAt: t.creadoAt,
  };
}

function detalle(e: Estado, u: UsuarioD, t: TicketD): TicketDetalle {
  const adj = e.adjuntos.filter((a) => a.ticketId === t.id && !a.enLinea);
  return {
    ...resumen(e, t),
    foliosRef: t.foliosRef,
    descripcionHtml: t.descripcionHtml,
    tituloDetalle: e.tipos.find((x) => x.id === t.tipoId)!.tituloDetalle,
    creadoPor: ref(e, t.creadoPorId)!,
    tomadoAt: t.tomadoAt,
    primeraRespuestaAt: t.primeraRespuestaAt,
    pausadoAt: t.pausadoAt,
    cerradoAt: t.cerradoAt,
    cerradoPor: ref(e, t.cerradoPorId),
    version: t.version,
    copias: t.copias,
    adjuntos: adj.filter((a) => a.mensajeId === null).map(infoAdjunto),
    mensajes: e.mensajes
      .filter((m) => m.ticketId === t.id)
      .map((m) => ({ id: m.id, tipo: m.tipo, autor: ref(e, m.autorId)!, esSoporte: m.tipo !== 'COMENTARIO', html: m.html, creadoAt: m.creadoAt, adjuntos: adj.filter((a) => a.mensajeId === m.id).map(infoAdjunto) })),
    acciones: accionesDisponibles({ estatus: t.estatus, solicitanteId: t.solicitanteId, asignadoAId: t.asignadoAId }, { id: u.id, permisos: permisosDe(u) }),
  };
}

function inicioDia(fecha: string, fin = false) {
  const d = new Date(`${fecha}T00:00:00`);
  if (fin) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function listar(e: Estado, u: UsuarioD, consulta: Record<string, unknown>) {
  const f = validar(esquemaListarTickets, consulta);
  const q = f.q?.trim().toLowerCase();
  const filtrados = (conEstatus: boolean) =>
    e.tickets.filter((t) => {
      if (!visible(u, t)) return false;
      if (conEstatus && f.estatus && t.estatus !== f.estatus) return false;
      if (f.tipoId && t.tipoId !== f.tipoId) return false;
      if (f.empresaId && t.empresaId !== f.empresaId) return false;
      if (f.moduloId && t.moduloId !== f.moduloId) return false;
      if (f.solicitanteId && t.solicitanteId !== f.solicitanteId) return false;
      if (f.asignadoAId === 'ninguno' && t.asignadoAId !== null) return false;
      if (typeof f.asignadoAId === 'number' && t.asignadoAId !== f.asignadoAId) return false;
      if (f.desde && new Date(t.creadoAt).getTime() < inicioDia(f.desde)) return false;
      if (f.hasta && new Date(t.creadoAt).getTime() >= inicioDia(f.hasta, true)) return false;
      if (q) {
        const r = resumen(e, t);
        const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        const campos = [t.folio, t.concepto ?? '', t.foliosRef ?? '', texto(t.descripcionHtml), r.empresa.nombre, r.solicitante.username, r.solicitante.nombre];
        if (!campos.some((c) => sinAcentos(c).includes(sinAcentos(q)))) return false;
      }
      return true;
    });
  const todos = filtrados(false);
  const lista = filtrados(true).sort((a, b) => (f.orden === 'antiguos' ? 1 : -1) * (new Date(a.creadoAt).getTime() - new Date(b.creadoAt).getTime() || a.id - b.id));
  const contadores = { total: todos.length, PENDIENTE: 0, EN_PROCESO: 0, PAUSADO: 0, COMPLETADO: 0 };
  for (const t of todos) contadores[t.estatus]++;
  const inicio = (f.pagina - 1) * f.porPagina;
  return { datos: lista.slice(inicio, inicio + f.porPagina).map((t) => resumen(e, t)), total: lista.length, pagina: f.pagina, porPagina: f.porPagina, contadores };
}

async function guardarArchivos(e: Estado, archivosSubidos: File[], ticketId: number, mensajeId: number | null) {
  const a = e.ajustes as Record<ClaveAjuste, never>;
  const tipos = a['adjuntos.tipos'] as string[];
  if (archivosSubidos.length > a['adjuntos.max_por_mensaje']) throw error(400, 'ARCHIVO_INVALIDO', `Puedes adjuntar como máximo ${a['adjuntos.max_por_mensaje']} archivos.`);
  for (const f of archivosSubidos) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!tipos.includes(ext)) throw error(400, 'ARCHIVO_INVALIDO', `No se permiten archivos .${ext}.`);
    if (f.size > a['adjuntos.max_mb'] * 1024 * 1024) throw error(400, 'ARCHIVO_INVALIDO', `"${f.name}" pesa más de ${a['adjuntos.max_mb']} MB.`);
  }
  for (const f of archivosSubidos) {
    const uuid = crypto.randomUUID();
    archivos.set(uuid, URL.createObjectURL(f));
    e.adjuntos.push({ uuid, ticketId, mensajeId, nombre: f.name, mime: f.type || 'application/octet-stream', tamano: f.size, enLinea: false });
  }
}

function accion(e: Estado, u: UsuarioD, t: TicketD, a: Accion, version?: number) {
  const r = validarAccion(a, { estatus: t.estatus, solicitanteId: t.solicitanteId, asignadoAId: t.asignadoAId }, { id: u.id, permisos: permisosDe(u) });
  if (!r.ok) throw r.codigo === 'SIN_PERMISO' ? error(403, 'PROHIBIDO', r.mensaje) : error(409, r.codigo, r.mensaje);
  if (version !== undefined && version !== t.version) throw error(409, 'VERSION', 'El ticket cambió mientras lo veías. Revisa y vuelve a intentar.');
  return r.estatusNuevo;
}

// ---------------------------------------------------------------- Enrutador
type Opciones = { json?: unknown; form?: FormData; consulta?: Record<string, unknown> };

export async function atender<T>(metodo: string, rutaCompleta: string, o: Opciones): Promise<T> {
  // Pequeña espera para que se vean los estados de carga como en el sistema real.
  await new Promise((r) => setTimeout(r, 120));
  const e = estado();
  const [ruta] = rutaCompleta.split('?');
  const consulta = { ...Object.fromEntries(new URLSearchParams(rutaCompleta.split('?')[1] ?? '')), ...(o.consulta ?? {}) };
  for (const k of Object.keys(consulta)) if (consulta[k] === undefined || consulta[k] === null || consulta[k] === '') delete consulta[k];
  const cuerpo = (o.form ? JSON.parse(String(o.form.get('datos') ?? '{}')) : o.json ?? {}) as Record<string, unknown>;
  const subidos = o.form ? (o.form.getAll('archivos') as File[]) : [];
  const partes = ruta!.split('/').filter(Boolean);
  const id = Number(partes[1]);
  const r = await enrutar(e, metodo, partes, id, consulta, cuerpo, subidos, o.form);
  guardar();
  return r as T;
}

async function enrutar(e: Estado, metodo: string, p: string[], id: number, consulta: Record<string, unknown>, cuerpo: Record<string, unknown>, subidos: File[], form?: FormData): Promise<unknown> {
  const clave = `${metodo} /${p.map((x, i) => (i === 1 && /^\d+$/.test(x) ? ':id' : x)).join('/')}`;

  // ---------------------------------------------------------- auth
  if (clave === 'POST /auth/login') {
    const d = validar(esquemaLogin, cuerpo);
    const u = e.usuarios.find((x) => x.username.toLowerCase() === d.username.toLowerCase() && !x.eliminado);
    if (!u || u.password !== d.password) throw error(401, 'NO_AUTENTICADO', 'Usuario o contraseña incorrectos.');
    if (!u.activo) throw error(403, 'PROHIBIDO', 'Tu usuario está desactivado. Solicita acceso al administrador.');
    u.ultimoLoginAt = new Date().toISOString();
    e.sesionUsuarioId = u.id;
    return sesion(e, u);
  }
  if (clave === 'POST /auth/logout') {
    e.sesionUsuarioId = null;
    return undefined;
  }
  const u = actual(e);
  if (clave === 'GET /auth/yo') return sesion(e, u);
  if (clave === 'POST /auth/actividad') return undefined;
  if (clave === 'POST /auth/cambiar-password') {
    const d = validar(esquemaCambiarPassword, cuerpo);
    validar(esquemaPassword(8), d.nueva);
    if (d.actual !== u.password) throw error(400, 'VALIDACION', 'La contraseña actual no es correcta.', { actual: 'La contraseña actual no es correcta.' });
    u.password = d.nueva;
    u.debeCambiar = false;
    return sesion(e, u);
  }
  if (u.debeCambiar) throw error(403, 'CAMBIAR_PASSWORD', 'Debes cambiar tu contraseña antes de continuar.');
  const permisos = permisosDe(u);

  // ---------------------------------------------------------- catálogos
  if (clave === 'GET /catalogos') {
    const admin = consulta.admin === '1' && permisos.has(PERMISOS.CATALOGOS_ADMINISTRAR);
    const verTodas = permisos.has(PERMISOS.TICKETS_VER_TODOS) || admin;
    const cuenta = (campo: 'empresaId' | 'tipoId' | 'moduloId', cid: number) => e.tickets.filter((t) => t[campo] === cid).length;
    return {
      empresas: e.empresas
        .filter((x) => (admin || x.activo) && (verTodas || u.empresaIds.includes(x.id)))
        .map((x) => ({ id: x.id, nombre: x.nombre, codigo: x.codigo!, activa: x.activo, orden: x.orden, ...(admin ? { tickets: cuenta('empresaId', x.id), usuarios: e.usuarios.filter((y) => !y.eliminado && y.empresaIds.includes(x.id)).length } : {}) })),
      tipos: e.tipos.filter((x) => admin || x.activo).map((x) => ({ ...x, codigo: x.codigo!, ...(admin ? { tickets: cuenta('tipoId', x.id) } : {}) })),
      modulos: e.modulos.filter((x) => admin || x.activo).map((x) => ({ ...x, ...(admin ? { tickets: cuenta('moduloId', x.id) } : {}) })),
      estatus: LISTA_ESTATUS.map((c, i) => ({ codigo: c, nombre: INFO_ESTATUS[c].nombre, clase: INFO_ESTATUS[c].clase, orden: i + 1 })),
    };
  }
  if (p[0] === 'catalogos' && (metodo === 'POST' || metodo === 'PUT')) {
    requiere(u, PERMISOS.CATALOGOS_ADMINISTRAR);
    const coleccion = p[1] as 'empresas' | 'tipos' | 'modulos';
    const lista = e[coleccion] as (CatalogoD | TipoD)[];
    const esquema = coleccion === 'empresas' ? esquemaEmpresa : coleccion === 'tipos' ? esquemaTipoSolicitud : esquemaModulo;
    const d = validar(esquema, cuerpo) as Record<string, unknown> & { nombre: string; codigo: string | null; orden: number };
    const eid = metodo === 'PUT' ? Number(p[2]) : null;
    if (lista.some((x) => x.id !== eid && (x.nombre.toLowerCase() === d.nombre.toLowerCase() || (d.codigo && x.codigo === d.codigo)))) {
      throw error(409, 'DUPLICADO', 'Ya existe un registro con ese nombre o código.');
    }
    const activo = (d.activa ?? d.activo ?? true) as boolean;
    const datos = { ...d, activo, codigo: d.codigo ?? null };
    delete (datos as Record<string, unknown>).activa;
    if (eid === null) {
      lista.push({ ...(datos as unknown as TipoD), id: nuevoIdE(e) });
      return { id: e.siguiente - 1, advertencia: null };
    }
    const x = lista.find((y) => y.id === eid);
    if (!x) throw error(404, 'NO_ENCONTRADO', 'No existe.');
    const cambioCodigo = x.codigo !== datos.codigo && coleccion !== 'modulos' && e.tickets.some((t) => (coleccion === 'empresas' ? t.empresaId : t.tipoId) === eid);
    Object.assign(x, datos);
    return { id: eid, advertencia: cambioCodigo ? 'El código cambió. Los folios ya emitidos no cambian; los tickets nuevos usarán el código nuevo.' : null };
  }

  // ---------------------------------------------------------- usuarios
  if (clave === 'GET /usuarios/contactos') {
    const q = String(consulta.q ?? '').toLowerCase();
    if (q.length < 2) return [];
    return e.usuarios
      .filter((x) => x.activo && !x.eliminado && x.id !== u.id && [x.username, x.nombre ?? '', x.email].some((c) => c.toLowerCase().includes(q)))
      .slice(0, 20)
      .map((x) => ({ id: x.id, username: x.username, nombre: nombreVisible(x), email: x.email }));
  }
  if (clave === 'GET /usuarios/tecnicos') {
    return e.usuarios.filter((x) => x.rol === 'ADMIN_SOPORTE' && x.activo && !x.eliminado).map((x) => ({ id: x.id, username: x.username, nombre: nombreVisible(x) }));
  }
  if (p[0] === 'usuarios') {
    requiere(u, PERMISOS.USUARIOS_ADMINISTRAR);
    const roles = [
      { id: 1, codigo: 'USUARIO', nombre: 'Usuario', descripcion: null },
      { id: 2, codigo: 'ADMIN_SOPORTE', nombre: 'Admin soporte', descripcion: null },
    ];
    const fila = (x: UsuarioD): UsuarioFila => ({
      id: x.id,
      username: x.username,
      nombre: x.nombre,
      email: x.email,
      rol: roles.find((r) => r.codigo === x.rol)!,
      empresas: e.empresas.filter((y) => x.empresaIds.includes(y.id)).map((y) => ({ id: y.id, nombre: y.nombre })),
      activo: x.activo,
      ultimoLoginAt: x.ultimoLoginAt,
      enLinea: x.id === e.sesionUsuarioId,
      creadoAt: x.creadoAt,
    });
    const buscar = (uid: number) => {
      const x = e.usuarios.find((y) => y.id === uid && !y.eliminado);
      if (!x) throw error(404, 'NO_ENCONTRADO', 'El usuario no existe o fue dado de baja.');
      return x;
    };
    if (clave === 'GET /usuarios/roles') return roles;
    if (clave === 'GET /usuarios') return e.usuarios.filter((x) => !x.eliminado).sort((a, b) => a.username.localeCompare(b.username)).map(fila);
    if (clave === 'POST /usuarios' || clave === 'PUT /usuarios/:id') {
      const nuevo = metodo === 'POST';
      const d = validar(nuevo ? esquemaUsuarioCrear : esquemaUsuarioEditar, cuerpo);
      if (e.usuarios.some((x) => x.username.toLowerCase() === d.username.toLowerCase() && x.id !== id)) throw error(409, 'USUARIO_DUPLICADO', 'Ese nombre de usuario ya existe. Elige otro.');
      const rol = roles.find((r) => r.id === d.rolId);
      if (!rol) throw error(400, 'VALIDACION', 'El rol seleccionado no existe.', { rolId: 'El rol seleccionado no existe.' });
      if (nuevo) {
        const x: UsuarioD = { id: nuevoIdE(e), username: d.username, nombre: d.nombre, email: d.email, password: d.password as string, rol: rol.codigo as UsuarioD['rol'], empresaIds: d.empresaIds, activo: true, eliminado: false, ultimoLoginAt: null, debeCambiar: true, creadoAt: new Date().toISOString() };
        e.usuarios.push(x);
        return fila(x);
      }
      const x = buscar(id);
      if (x.id === u.id && !d.activo) throw error(409, 'CONFLICTO', 'No puedes desactivar tu propio usuario.');
      Object.assign(x, { username: d.username, nombre: d.nombre, email: d.email, rol: rol.codigo, empresaIds: d.empresaIds, activo: d.activo });
      if (d.password) Object.assign(x, { password: d.password, debeCambiar: x.id !== u.id });
      return fila(x);
    }
    if (clave === 'DELETE /usuarios/:id') {
      if (id === u.id) throw error(409, 'CONFLICTO', 'No puedes eliminar tu propio usuario.');
      buscar(id).eliminado = true;
      return undefined;
    }
    if (clave === 'POST /usuarios/:id/cerrar-sesion') {
      buscar(id);
      return { sesionesCerradas: 0 };
    }
    if (clave === 'GET /usuarios/:id') return fila(buscar(id));
  }

  // ---------------------------------------------------------- adjuntos (imágenes del editor)
  if (clave === 'POST /adjuntos/temporal') {
    const f = form?.get('archivo');
    if (!(f instanceof File) || !f.type.startsWith('image/')) throw error(400, 'ARCHIVO_INVALIDO', 'Solo se pueden insertar imágenes PNG, JPG, GIF o WEBP.');
    // Las imágenes pequeñas se guardan como data: para que sigan visibles después de recargar.
    const url =
      f.size <= 300_000
        ? await new Promise<string>((ok) => {
            const lector = new FileReader();
            lector.onload = () => ok(String(lector.result));
            lector.readAsDataURL(f);
          })
        : URL.createObjectURL(f);
    return { uuid: crypto.randomUUID(), url };
  }

  // ---------------------------------------------------------- tickets
  if (clave === 'GET /tickets') {
    const verAlguno = [PERMISOS.TICKETS_VER_PROPIOS, PERMISOS.TICKETS_VER_TODOS].some((x) => permisos.has(x));
    if (!verAlguno) throw error(403, 'PROHIBIDO', 'No tienes permiso.');
    return listar(e, u, consulta);
  }
  if (clave === 'POST /tickets') {
    requiere(u, PERMISOS.TICKETS_CREAR);
    const d = validar(esquemaTicketCrear, cuerpo);
    const tipo = e.tipos.find((x) => x.id === d.tipoId && x.activo);
    if (!tipo) throw error(400, 'VALIDACION', 'Selecciona un tipo de solicitud válido.', { tipoId: 'Selecciona un tipo de solicitud válido.' });
    const campos: Record<string, string> = {};
    const empresa = e.empresas.find((x) => x.id === d.empresaId && x.activo);
    if (!empresa) campos.empresaId = 'Selecciona una empresa válida.';
    else if (!permisos.has(PERMISOS.TICKETS_VER_TODOS) && !u.empresaIds.includes(empresa.id)) campos.empresaId = 'Esa empresa no está asignada al solicitante.';
    if (tipo.requiereModulo && !d.moduloId) campos.moduloId = 'Selecciona el módulo.';
    if (tipo.requiereConcepto && !d.concepto) campos.concepto = 'Escribe el concepto.';
    if (tipo.requiereFolios && !d.foliosRef) campos.foliosRef = 'Escribe el folio o folios relacionados.';
    const html = limpiarHtml(d.descripcionHtml);
    if (!tieneContenido(html)) campos.descripcionHtml = 'Escribe la descripción detallada.';
    if (Object.keys(campos).length) throw error(400, 'VALIDACION', Object.values(campos)[0]!, campos);
    const solicitante = d.solicitanteId && permisos.has(PERMISOS.TICKETS_CREAR_A_NOMBRE_DE) ? (e.usuarios.find((x) => x.id === d.solicitanteId) ?? u) : u;

    const prefijo = prefijoFolio(empresa!.codigo!, tipo.codigo!);
    e.folios[prefijo] = (e.folios[prefijo] ?? 0) + 1;
    const copias = d.copias.map((c) => {
      if ('usuarioId' in c) {
        const x = e.usuarios.find((y) => y.id === c.usuarioId)!;
        return { email: x.email, nombre: nombreVisible(x), usuarioId: x.id };
      }
      return { email: c.email, nombre: null, usuarioId: null };
    });
    const t: TicketD = {
      id: nuevoIdE(e),
      folio: formatearFolio(prefijo, e.folios[prefijo]!),
      tipoId: tipo.id,
      empresaId: empresa!.id,
      moduloId: d.moduloId ?? null,
      concepto: d.concepto,
      foliosRef: d.foliosRef,
      descripcionHtml: html,
      estatus: ESTATUS.PENDIENTE,
      solicitanteId: solicitante.id,
      creadoPorId: u.id,
      asignadoAId: null,
      creadoAt: new Date().toISOString(),
      tomadoAt: null,
      primeraRespuestaAt: null,
      pausadoAt: null,
      cerradoAt: null,
      cerradoPorId: null,
      version: 0,
      copias,
    };
    await guardarArchivos(e, subidos, t.id, null);
    e.tickets.push(t);
    const correos = encolar(e, 'TICKET_CREADO', solicitante, t) ? 1 : 0;
    evento(e, t, u.id, 'CREADO', null, 'PENDIENTE', { folio: t.folio });
    return { id: t.id, folio: t.folio, correosEncolados: correos };
  }
  if (clave === 'GET /tickets/:id') return detalle(e, u, buscarTicket(e, u, id));
  if (clave === 'GET /tickets/:id/historial') {
    requiere(u, PERMISOS.TICKETS_VER_HISTORIAL);
    buscarTicket(e, u, id);
    return e.eventos
      .filter((x) => x.ticketId === id)
      .map<EventoInfo>((x) => ({
        id: x.id,
        tipo: x.tipo,
        actor: ref(e, x.actorId),
        estatusAntes: x.estatusAntes,
        estatusDespues: x.estatusDespues,
        datos: x.tipo === 'REASIGNADO' ? { ...x.datos, deNombre: ref(e, x.datos?.de as number)?.nombre ?? null, aNombre: ref(e, x.datos?.a as number)?.nombre ?? null } : x.datos,
        creadoAt: x.creadoAt,
      }));
  }
  if (p[0] === 'tickets' && metodo === 'POST' && p[2]) {
    const t = buscarTicket(e, u, id);
    const ahora = new Date().toISOString();
    const antes = t.estatus;
    const cambiar = (nuevo: Estatus, extra: Partial<TicketD> = {}) => Object.assign(t, extra, { estatus: nuevo, version: t.version + 1 });
    switch (p[2]) {
      case 'tomar': {
        const n = accion(e, u, t, 'tomar');
        cambiar(n, { asignadoAId: u.id, tomadoAt: ahora });
        evento(e, t, u.id, 'TOMADO', antes, n, null);
        return undefined;
      }
      case 'pausar': {
        const d = validar(esquemaPausar, cuerpo);
        const n = accion(e, u, t, 'pausar', d.version);
        cambiar(n, { pausadoAt: ahora });
        evento(e, t, u.id, 'PAUSADO', antes, n, { motivo: d.motivo });
        return undefined;
      }
      case 'reanudar': {
        const d = validar(esquemaVersion, cuerpo);
        const n = accion(e, u, t, 'reanudar', d.version);
        cambiar(n, { pausadoAt: null });
        evento(e, t, u.id, 'REANUDADO', antes, n, null);
        return undefined;
      }
      case 'reasignar': {
        const d = validar(esquemaReasignar, cuerpo);
        const n = accion(e, u, t, 'reasignar', d.version);
        const destino = e.usuarios.find((x) => x.id === d.asignadoAId && x.rol === 'ADMIN_SOPORTE' && x.activo && !x.eliminado);
        if (!destino) throw error(400, 'VALIDACION', 'Selecciona un técnico activo.', { asignadoAId: 'Selecciona un técnico activo.' });
        const de = t.asignadoAId;
        cambiar(n, { asignadoAId: destino.id });
        evento(e, t, u.id, 'REASIGNADO', antes, n, { de, a: destino.id });
        return undefined;
      }
      case 'reabrir': {
        const d = validar(esquemaVersion, cuerpo);
        const n = accion(e, u, t, 'reabrir', d.version);
        cambiar(n, { cerradoAt: null, cerradoPorId: null });
        evento(e, t, u.id, 'REABIERTO', antes, n, null);
        return undefined;
      }
      case 'comentarios':
      case 'respuestas': {
        const respuesta = p[2] === 'respuestas';
        const d = validar(esquemaMensaje, cuerpo);
        const html = limpiarHtml(d.html);
        if (!tieneContenido(html) && !subidos.length) throw error(400, 'VALIDACION', respuesta ? 'Escribe la respuesta.' : 'Escribe un comentario o adjunta un archivo.', { html: 'Escribe un mensaje.' });
        const n = accion(e, u, t, respuesta ? 'responder' : 'comentar');
        const m: MensajeD = { id: nuevoIdE(e), ticketId: t.id, autorId: u.id, tipo: respuesta ? 'RESPUESTA' : 'COMENTARIO', html: html || '<p></p>', creadoAt: ahora };
        await guardarArchivos(e, subidos, t.id, m.id);
        e.mensajes.push(m);
        cambiar(n, respuesta && !t.primeraRespuestaAt ? { primeraRespuestaAt: ahora } : {});
        evento(e, t, u.id, respuesta ? 'RESPONDIDO' : 'COMENTADO', antes, n, null);
        if (respuesta && (e.ajustes['correo.respuestas_activas'] as boolean)) {
          encolar(e, 'TICKET_RESPUESTA', e.usuarios.find((x) => x.id === t.solicitanteId)!, t);
        }
        return undefined;
      }
      case 'cerrar': {
        const d = validar(esquemaCerrar, cuerpo);
        const html = limpiarHtml(d.resolucionHtml);
        if (!tieneContenido(html)) throw error(400, 'VALIDACION', 'La resolución es obligatoria para cerrar el ticket.', { resolucionHtml: 'La resolución es obligatoria para cerrar el ticket.' });
        const n = accion(e, u, t, 'cerrar', d.version);
        const m: MensajeD = { id: nuevoIdE(e), ticketId: t.id, autorId: u.id, tipo: 'RESOLUCION', html, creadoAt: ahora };
        await guardarArchivos(e, subidos, t.id, m.id);
        e.mensajes.push(m);
        cambiar(n, { cerradoAt: ahora, cerradoPorId: u.id, pausadoAt: null, primeraRespuestaAt: t.primeraRespuestaAt ?? ahora });
        encolar(e, 'TICKET_CERRADO', e.usuarios.find((x) => x.id === t.solicitanteId)!, t);
        evento(e, t, u.id, 'CERRADO', antes, n, null);
        return undefined;
      }
    }
  }

  // ---------------------------------------------------------- correos
  if (clave === 'GET /correos') {
    requiere(u, PERMISOS.CORREOS_COLA);
    // En la demo los correos "se envían" solos unos segundos después (no sale nada real).
    for (const c of e.correos) {
      if (c.estado === 'PENDIENTE' && Date.now() - new Date(c.creadoAt).getTime() > 3000) Object.assign(c, { estado: 'ENVIADO', intentos: 1, enviadoAt: new Date().toISOString() });
    }
    const pagina = Number(consulta.pagina ?? 1);
    const lista = e.correos.filter((c) => !consulta.estado || c.estado === consulta.estado).sort((a, b) => b.id - a.id);
    const resumenEstados: Record<string, number> = {};
    for (const c of e.correos) resumenEstados[c.estado] = (resumenEstados[c.estado] ?? 0) + 1;
    return {
      datos: lista.slice((pagina - 1) * 25, pagina * 25).map((c) => ({ ...c, ticketFolio: e.tickets.find((t) => t.id === c.ticketId)?.folio ?? null, proximoIntentoAt: null, ultimoError: null })),
      total: lista.length,
      pagina,
      porPagina: 25,
      transporte: 'demo (no se envían correos reales)',
      resumen: resumenEstados,
    };
  }
  if (clave === 'POST /correos/:id/reintentar') {
    requiere(u, PERMISOS.CORREOS_COLA);
    throw error(409, 'CONFLICTO', 'Solo se pueden reintentar correos fallidos o cancelados.');
  }
  if (clave === 'GET /correos/plantillas') {
    requiere(u, PERMISOS.CORREOS_PLANTILLAS);
    return e.plantillas;
  }
  if (clave === 'POST /correos/plantillas/vista-previa') {
    requiere(u, PERMISOS.CORREOS_PLANTILLAS);
    const d = validar(esquemaPlantilla, cuerpo);
    const ejemplo = { folio: 'ASCA-0063', tipo: 'Cancelación', empresa: 'Autotransportes Asturcones', modulo: 'Compras', concepto: 'CARTA PORTE', folios: 'B12345', estatus: 'Pendiente', solicitante: 'Laura Méndez', fecha: '28 de septiembre de 2026, 8:57 a.m.', fecha_cierre: '28 de septiembre de 2026, 11:20 a.m.', tecnico: 'Pedro Salas', url_ticket: '#', empresa_sistema: 'Grupo Aramo', resolucion_html: '<p>Se canceló la carta porte y se generó una nueva.</p>', mensaje_html: '<p>Estamos revisando tu solicitud.</p>', descripcion_html: '<p>Buenos días, me pueden ayudar…</p>' };
    return { asunto: renderizar(d.asunto, ejemplo, false), html: renderizar(limpiarHtml(d.cuerpoHtml), ejemplo) };
  }
  if (clave === 'PUT /correos/plantillas/:id') {
    requiere(u, PERMISOS.CORREOS_PLANTILLAS);
    const d = validar(esquemaPlantilla, cuerpo);
    const pl = e.plantillas.find((x) => x.id === Number(p[2]));
    if (!pl) throw error(404, 'NO_ENCONTRADO', 'La plantilla no existe.');
    Object.assign(pl, { asunto: d.asunto, cuerpoHtml: limpiarHtml(d.cuerpoHtml), activa: d.activa, actualizadoAt: new Date().toISOString() });
    return pl;
  }

  // ---------------------------------------------------------- ajustes
  if (p[0] === 'ajustes') {
    requiere(u, PERMISOS.AJUSTES_ADMINISTRAR);
    if (metodo === 'PUT') {
      const campos: Record<string, string> = {};
      for (const [k, v] of Object.entries(cuerpo)) {
        const def = DEFINICION_AJUSTES[k as ClaveAjuste];
        if (!def) {
          campos[k] = 'Ajuste desconocido.';
          continue;
        }
        const r = def.esquema.safeParse(v);
        if (r.success) e.ajustes[k] = r.data;
        else campos[k] = r.error.issues[0]?.message ?? 'Valor inválido.';
      }
      if (Object.keys(campos).length) throw error(400, 'VALIDACION', 'Revisa los ajustes marcados.', campos);
    }
    return {
      ajustes: (Object.keys(DEFINICION_AJUSTES) as ClaveAjuste[]).map((k) => ({ clave: k, valor: e.ajustes[k], descripcion: DEFINICION_AJUSTES[k].descripcion })),
      servidor: { transporteCorreo: 'demo', remitente: 'mesadeayuda@demo.local', adjuntosTechoMb: 25, zonaHoraria: 'America/Mexico_City', url: location.href },
    };
  }

  throw error(404, 'NO_ENCONTRADO', `No existe la ruta ${metodo} /${p.join('/')} en la demo.`);
}
