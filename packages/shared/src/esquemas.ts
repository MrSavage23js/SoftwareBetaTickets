// Esquemas de validación compartidos por la API (fuente de verdad) y los formularios de la web.
// Los mensajes están en español porque se muestran tal cual al usuario.
import { z } from 'zod';
import { LISTA_ESTATUS } from './estatus';
import { CODIGO_CATALOGO_REGEX } from './folio';

const texto = (campo: string, max: number) =>
  z
    .string({ error: `${campo} es obligatorio.` })
    .trim()
    .min(1, `${campo} es obligatorio.`)
    .max(max, `${campo} no puede pasar de ${max} caracteres.`);

const textoOpcional = (campo: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${campo} no puede pasar de ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

/** Ids que llegan como texto en formularios multipart o en la URL. */
export const idEntero = z.coerce
  .number({ error: 'Identificador inválido.' })
  .int('Identificador inválido.')
  .positive('Identificador inválido.');

const booleano = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1');

// ---------------------------------------------------------------- Autenticación
export const esquemaLogin = z.object({
  username: texto('El nombre de usuario', 60),
  password: z.string({ error: 'La contraseña es obligatoria.' }).min(1, 'La contraseña es obligatoria.').max(200),
});
export type LoginEntrada = z.infer<typeof esquemaLogin>;

// ---------------------------------------------------------------- Usuarios
export const USERNAME_REGEX = /^[A-Za-z0-9._-]{3,60}$/;

export function esquemaPassword(min = 8) {
  return z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(min, `La contraseña debe tener al menos ${min} caracteres.`)
    .max(200, 'La contraseña es demasiado larga.')
    .refine((v) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(v) && /\d/.test(v), 'La contraseña debe incluir letras y números.');
}

const baseUsuario = z.object({
  username: z
    .string({ error: 'El nombre de usuario es obligatorio.' })
    .trim()
    .regex(USERNAME_REGEX, 'El nombre de usuario debe tener de 3 a 60 caracteres: letras, números, punto, guion o guion bajo.'),
  nombre: textoOpcional('El nombre', 120),
  email: z.string({ error: 'El correo es obligatorio.' }).trim().toLowerCase().pipe(z.email('El correo electrónico no es válido.')),
  rolId: idEntero,
  empresaIds: z.array(idEntero).max(200).default([]),
  activo: booleano.optional().default(true),
});

export const esquemaUsuarioCrear = baseUsuario
  .extend({ password: esquemaPassword(), confirmarPassword: z.string() })
  .refine((d) => d.password === d.confirmarPassword, {
    path: ['confirmarPassword'],
    message: 'Las contraseñas no coinciden.',
  });
export type UsuarioCrearEntrada = z.input<typeof esquemaUsuarioCrear>;

export const esquemaUsuarioEditar = baseUsuario
  .extend({
    password: z.union([z.literal(''), esquemaPassword()]).optional(),
    confirmarPassword: z.string().optional(),
  })
  .refine((d) => !d.password || d.password === d.confirmarPassword, {
    path: ['confirmarPassword'],
    message: 'Las contraseñas no coinciden.',
  });
export type UsuarioEditarEntrada = z.input<typeof esquemaUsuarioEditar>;

// ---------------------------------------------------------------- Catálogos
const codigo = z
  .string({ error: 'El código es obligatorio.' })
  .trim()
  .toUpperCase()
  .regex(CODIGO_CATALOGO_REGEX, 'El código debe tener de 2 a 4 letras o números, sin espacios.');

export const esquemaEmpresa = z.object({
  nombre: texto('El nombre', 120),
  codigo,
  activa: booleano.optional().default(true),
  orden: z.coerce.number().int().min(0).max(9999).optional().default(0),
});
export type EmpresaEntrada = z.input<typeof esquemaEmpresa>;

export const esquemaTipoSolicitud = z.object({
  nombre: texto('El nombre', 80),
  codigo,
  tituloDetalle: texto('El título de la sección', 80),
  requiereModulo: booleano.optional().default(true),
  requiereConcepto: booleano.optional().default(true),
  requiereFolios: booleano.optional().default(true),
  activo: booleano.optional().default(true),
  orden: z.coerce.number().int().min(0).max(9999).optional().default(0),
});
export type TipoSolicitudEntrada = z.input<typeof esquemaTipoSolicitud>;

export const esquemaModulo = z.object({
  nombre: texto('El nombre', 80),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, 'El código debe tener de 2 a 6 letras o números.')
    .optional()
    .or(z.literal('').transform(() => undefined))
    .transform((v) => v ?? null),
  activo: booleano.optional().default(true),
  orden: z.coerce.number().int().min(0).max(9999).optional().default(0),
});
export type ModuloEntrada = z.input<typeof esquemaModulo>;

// ---------------------------------------------------------------- Tickets
export const MAX_HTML = 200_000;

const html = (campo: string) =>
  z
    .string({ error: `${campo} es obligatoria.` })
    .max(MAX_HTML, `${campo} es demasiado larga.`);

const copia = z.union([
  z.object({ usuarioId: idEntero }),
  z.object({ email: z.string().trim().toLowerCase().pipe(z.email('Un correo en copia no es válido.')), nombre: z.string().max(120).optional() }),
]);

export const esquemaTicketCrear = z.object({
  tipoId: idEntero,
  empresaId: idEntero,
  moduloId: idEntero.optional().nullable(),
  concepto: textoOpcional('El concepto', 200),
  foliosRef: textoOpcional('Folio(s)', 500),
  descripcionHtml: html('La descripción'),
  copias: z.array(copia).max(20, 'Máximo 20 contactos en copia.').default([]),
  /** Solo para quien tenga `tickets.crear_a_nombre_de`. */
  solicitanteId: idEntero.optional().nullable(),
  /** Imágenes subidas antes desde el editor (uuid de adjuntos temporales). */
  adjuntosEnLinea: z.array(z.uuid()).max(50).default([]),
});
export type TicketCrearEntrada = z.input<typeof esquemaTicketCrear>;

export const ORDEN_TICKETS = ['recientes', 'antiguos'] as const;

export const esquemaListarTickets = z.object({
  estatus: z.enum(LISTA_ESTATUS as [string, ...string[]]).optional(),
  q: z.string().trim().max(100).optional(),
  tipoId: idEntero.optional(),
  empresaId: idEntero.optional(),
  moduloId: idEntero.optional(),
  asignadoAId: z.union([idEntero, z.literal('ninguno')]).optional(),
  solicitanteId: idEntero.optional(),
  desde: z.iso.date('Fecha "desde" inválida (AAAA-MM-DD).').optional(),
  hasta: z.iso.date('Fecha "hasta" inválida (AAAA-MM-DD).').optional(),
  orden: z.enum(ORDEN_TICKETS).default('recientes'),
  pagina: z.coerce.number().int().min(1).max(100_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListarTicketsEntrada = z.input<typeof esquemaListarTickets>;

export const esquemaMensaje = z.object({
  html: html('El mensaje'),
  adjuntosEnLinea: z.array(z.uuid()).max(50).default([]),
});

export const esquemaPausar = z.object({ motivo: texto('El motivo', 500), version: z.coerce.number().int().min(0) });
export const esquemaVersion = z.object({ version: z.coerce.number().int().min(0) });
export const esquemaReasignar = z.object({ asignadoAId: idEntero, version: z.coerce.number().int().min(0) });
export const esquemaCerrar = z.object({
  resolucionHtml: html('La resolución'),
  version: z.coerce.number().int().min(0),
  adjuntosEnLinea: z.array(z.uuid()).max(50).default([]),
});

// ---------------------------------------------------------------- Plantillas y ajustes
export const esquemaPlantilla = z.object({
  asunto: texto('El asunto', 255),
  cuerpoHtml: html('El cuerpo'),
  activa: booleano.optional().default(true),
});
export type PlantillaEntrada = z.input<typeof esquemaPlantilla>;

// ---------------------------------------------------------------- Utilidades
/** Convierte un ZodError en { campo: mensaje } para mostrar junto a cada campo del formulario. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const i of error.issues) {
    const clave = i.path.join('.') || '_';
    if (!(clave in salida)) salida[clave] = i.message;
  }
  return salida;
}
