// Códigos de permiso. La relación rol → permisos vive en BD (tablas roles, permisos, rol_permisos);
// este archivo solo da nombres tipados para que el código no use cadenas sueltas.
export const PERMISOS = {
  TICKETS_CREAR: 'tickets.crear',
  TICKETS_CREAR_A_NOMBRE_DE: 'tickets.crear_a_nombre_de',
  TICKETS_VER_PROPIOS: 'tickets.ver_propios',
  TICKETS_VER_EMPRESA: 'tickets.ver_empresa',
  TICKETS_VER_TODOS: 'tickets.ver_todos',
  TICKETS_COMENTAR_PROPIOS: 'tickets.comentar_propios',
  TICKETS_TOMAR: 'tickets.tomar',
  TICKETS_PAUSAR: 'tickets.pausar',
  TICKETS_RESPONDER: 'tickets.responder',
  TICKETS_CERRAR: 'tickets.cerrar',
  TICKETS_REASIGNAR: 'tickets.reasignar',
  TICKETS_REABRIR: 'tickets.reabrir',
  TICKETS_VER_HISTORIAL: 'tickets.ver_historial',
  TICKETS_ATENDER: 'tickets.atender',
  USUARIOS_ADMINISTRAR: 'usuarios.administrar',
  USUARIOS_CERRAR_SESION: 'usuarios.cerrar_sesion',
  CATALOGOS_ADMINISTRAR: 'catalogos.administrar',
  CORREOS_PLANTILLAS: 'correos.plantillas',
  CORREOS_COLA: 'correos.cola',
  AJUSTES_ADMINISTRAR: 'ajustes.administrar',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export const ROLES = {
  USUARIO: 'USUARIO',
  ADMIN_SOPORTE: 'ADMIN_SOPORTE',
} as const;

/** Descripción y grupo de cada permiso (se siembra en BD y la usará la futura pantalla de permisos). */
export const DESCRIPCION_PERMISOS: Record<Permiso, { grupo: string; descripcion: string }> = {
  'tickets.crear': { grupo: 'Tickets', descripcion: 'Crear tickets' },
  'tickets.crear_a_nombre_de': { grupo: 'Tickets', descripcion: 'Crear tickets a nombre de otro usuario' },
  'tickets.ver_propios': { grupo: 'Tickets', descripcion: 'Ver los tickets propios' },
  'tickets.ver_empresa': { grupo: 'Tickets', descripcion: 'Ver los tickets de sus empresas asignadas' },
  'tickets.ver_todos': { grupo: 'Tickets', descripcion: 'Ver todos los tickets (bandeja de soporte)' },
  'tickets.comentar_propios': { grupo: 'Tickets', descripcion: 'Comentar y adjuntar en sus tickets' },
  'tickets.tomar': { grupo: 'Soporte', descripcion: 'Tomar tickets pendientes' },
  'tickets.pausar': { grupo: 'Soporte', descripcion: 'Pausar y reanudar tickets asignados' },
  'tickets.responder': { grupo: 'Soporte', descripcion: 'Responder tickets asignados' },
  'tickets.cerrar': { grupo: 'Soporte', descripcion: 'Cerrar tickets asignados' },
  'tickets.reasignar': { grupo: 'Soporte', descripcion: 'Reasignar tickets a otro técnico' },
  'tickets.reabrir': { grupo: 'Soporte', descripcion: 'Reabrir tickets completados' },
  'tickets.ver_historial': { grupo: 'Soporte', descripcion: 'Ver el historial completo de un ticket' },
  'tickets.atender': { grupo: 'Soporte', descripcion: 'Aparecer como técnico disponible para asignar' },
  'usuarios.administrar': { grupo: 'Administración', descripcion: 'Alta, edición y baja de usuarios' },
  'usuarios.cerrar_sesion': { grupo: 'Administración', descripcion: 'Cerrar la sesión de otro usuario' },
  'catalogos.administrar': { grupo: 'Administración', descripcion: 'Administrar empresas, tipos y módulos' },
  'correos.plantillas': { grupo: 'Administración', descripcion: 'Editar plantillas de correo' },
  'correos.cola': { grupo: 'Administración', descripcion: 'Ver y reintentar la cola de correos' },
  'ajustes.administrar': { grupo: 'Administración', descripcion: 'Cambiar los ajustes del sistema' },
};

const TODOS = Object.values(PERMISOS) as Permiso[];

/** Matriz inicial rol → permisos (se siembra; después se edita en BD). */
export const PERMISOS_INICIALES: Record<keyof typeof ROLES, Permiso[]> = {
  USUARIO: [PERMISOS.TICKETS_CREAR, PERMISOS.TICKETS_VER_PROPIOS, PERMISOS.TICKETS_COMENTAR_PROPIOS],
  // Reabrir y ver por empresa quedan fuera hasta que se confirmen (DECISIONES P4 y P5).
  ADMIN_SOPORTE: TODOS.filter((p) => p !== PERMISOS.TICKETS_REABRIR && p !== PERMISOS.TICKETS_VER_EMPRESA),
};
