// Definición de los ajustes editables desde la pantalla. La BD guarda el valor; aquí vive
// el tipo, los límites y la descripción, para validar igual en servidor y en formulario.
import { z } from 'zod';

export const DEFINICION_AJUSTES = {
  'sesion.inactividad_min': {
    descripcion: 'Minutos sin actividad antes de cerrar la sesión',
    esquema: z.coerce.number().int().min(5).max(24 * 60),
  },
  'sesion.max_horas': {
    descripcion: 'Duración máxima de una sesión (horas), aunque haya actividad',
    esquema: z.coerce.number().int().min(1).max(24 * 7),
  },
  'login.max_intentos': {
    descripcion: 'Intentos fallidos antes de bloquear la cuenta',
    esquema: z.coerce.number().int().min(3).max(20),
  },
  'login.bloqueo_min': {
    descripcion: 'Minutos de bloqueo tras exceder los intentos',
    esquema: z.coerce.number().int().min(1).max(24 * 60),
  },
  'password.min_caracteres': {
    descripcion: 'Longitud mínima de contraseña',
    esquema: z.coerce.number().int().min(8).max(64),
  },
  'adjuntos.max_mb': {
    descripcion: 'Tamaño máximo por archivo (MB); no puede superar ADJUNTOS_TECHO_MB del servidor',
    esquema: z.coerce.number().min(1).max(100),
  },
  'adjuntos.max_por_mensaje': {
    descripcion: 'Archivos máximos por mensaje',
    esquema: z.coerce.number().int().min(1).max(20),
  },
  'adjuntos.tipos': {
    descripcion: 'Extensiones permitidas',
    esquema: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9]{1,10}$/, 'Extensión inválida'),
      )
      .min(1)
      .max(50),
  },
  'correo.respuestas_activas': {
    descripcion: 'Enviar correo al solicitante cuando soporte responde (además de crear y cerrar)',
    esquema: z.boolean(),
  },
  'correo.aviso_soporte_activo': {
    descripcion: 'Avisar por correo a soporte cuando se crea un ticket',
    esquema: z.boolean(),
  },
  'correo.aviso_soporte_destino': {
    descripcion: 'Correo del buzón de soporte que recibe el aviso de ticket nuevo',
    esquema: z.union([z.literal(''), z.email('Correo inválido')]),
  },
  'kanban.tarjetas_por_columna': {
    descripcion: 'Tarjetas visibles por columna en el Kanban antes de "Ver más"',
    esquema: z.coerce.number().int().min(10).max(200),
  },
} as const;

export type ClaveAjuste = keyof typeof DEFINICION_AJUSTES;
export type ValoresAjustes = { [K in ClaveAjuste]: z.infer<(typeof DEFINICION_AJUSTES)[K]['esquema']> };
