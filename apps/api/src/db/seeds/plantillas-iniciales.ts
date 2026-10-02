// Plantillas de correo iniciales. HTML con tablas y estilos en línea porque Outlook no soporta CSS moderno.
// Variables: {{variable}} se escapa; {{{variable}}} inserta HTML ya sanitizado (solo las marcadas "html").

const VARIABLES_TICKET = [
  { nombre: 'folio', descripcion: 'Folio del ticket (SIS-2026-0001)' },
  { nombre: 'departamento', descripcion: 'Departamento que creó el ticket' },
  { nombre: 'urgencia', descripcion: 'Urgencia (Baja, Media, Alta, Crítica)' },
  { nombre: 'tipo', descripcion: 'Tipo de solicitud' },
  { nombre: 'empresa', descripcion: 'Empresa' },
  { nombre: 'modulo', descripcion: 'Módulo (o "—")' },
  { nombre: 'concepto', descripcion: 'Concepto (o "—")' },
  { nombre: 'folios', descripcion: 'Folio(s) de referencia (o "—")' },
  { nombre: 'estatus', descripcion: 'Estatus actual' },
  { nombre: 'solicitante', descripcion: 'Nombre del solicitante' },
  { nombre: 'solicitante_email', descripcion: 'Correo del solicitante' },
  { nombre: 'fecha', descripcion: 'Fecha y hora de creación' },
  { nombre: 'url_ticket', descripcion: 'Enlace directo al ticket' },
  { nombre: 'empresa_sistema', descripcion: 'Nombre de la organización (APP_NOMBRE_EMPRESA)' },
];

const fila = (etiqueta: string, variable: string) => `
          <tr>
            <td style="padding:6px 0;color:#4A5966;font-size:14px;width:140px;vertical-align:top">${etiqueta}</td>
            <td style="padding:6px 0;color:#17222D;font-size:14px;font-weight:600">{{${variable}}}</td>
          </tr>`;

const envoltura = (titulo: string, contenido: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 0;font-family:Segoe UI,Arial,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #DDE3E9;border-radius:12px">
      <tr><td style="background:#028183;color:#FFFFFF;padding:18px 28px;font-size:18px;font-weight:700;border-radius:12px 12px 0 0">Sistema de Tickets · {{empresa_sistema}}</td></tr>
      <tr><td style="padding:24px 28px">
        <h1 style="margin:0 0 16px;font-size:20px;color:#12202B">${titulo}</h1>
${contenido}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #E6EBEF;color:#4A5966;font-size:12px">Este correo se envió automáticamente desde el Sistema de Tickets. No respondas a este mensaje; usa el sistema para dar seguimiento.</td></tr>
    </table>
  </td></tr>
</table>`;

const boton = `
        <p style="margin:24px 0 0"><a href="{{url_ticket}}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Ver ticket en el sistema</a></p>`;

const tablaDatos = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${fila('Folio', 'folio')}${fila('Departamento', 'departamento')}${fila('Urgencia', 'urgencia')}${fila('Tipo', 'tipo')}${fila('Empresa', 'empresa')}${fila('Módulo', 'modulo')}${fila('Concepto', 'concepto')}${fila('Folio(s)', 'folios')}${fila('Estatus', 'estatus')}
        </table>`;

export const PLANTILLAS = [
  {
    codigo: 'TICKET_CREADO',
    nombre: 'Ticket creado',
    descripcion: 'Se envía al solicitante y a las personas en copia cuando se crea un ticket.',
    asunto: '[{{folio}}] Ticket creado · {{tipo}}',
    variables: VARIABLES_TICKET,
    cuerpoHtml: envoltura(
      'Recibimos tu solicitud',
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px">Hola {{solicitante}}, tu ticket se registró correctamente. Soporte lo atenderá lo antes posible.</p>${tablaDatos}${boton}`,
    ),
  },
  {
    codigo: 'TICKET_CERRADO',
    nombre: 'Ticket cerrado',
    descripcion: 'Se envía al solicitante cuando soporte cierra el ticket.',
    asunto: '[{{folio}}] Ticket cerrado',
    variables: [
      ...VARIABLES_TICKET,
      { nombre: 'tecnico', descripcion: 'Técnico que atendió el ticket' },
      { nombre: 'fecha_cierre', descripcion: 'Fecha y hora de cierre' },
      { nombre: 'resolucion_html', descripcion: 'Texto de resolución (HTML; usar con triple llave)' },
    ],
    cuerpoHtml: envoltura(
      'Tu ticket fue cerrado',
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px">Hola {{solicitante}}, <strong>{{tecnico}}</strong> cerró tu ticket <strong>{{folio}}</strong> el {{fecha_cierre}}.</p>
        <div style="margin:0 0 16px;padding:14px 16px;background:#EAF3F3;border:1px solid #BFDCDC;border-radius:8px;color:#17222D;font-size:14px"><div style="font-weight:700;margin-bottom:6px">Resolución</div>{{{resolucion_html}}}</div>${tablaDatos}${boton}`,
    ),
  },
  {
    codigo: 'TICKET_RESPUESTA',
    nombre: 'Respuesta de soporte',
    descripcion: 'Se envía al solicitante cuando soporte responde (solo si el ajuste "correo.respuestas_activas" está encendido).',
    asunto: '[{{folio}}] Respuesta de soporte',
    variables: [
      ...VARIABLES_TICKET,
      { nombre: 'tecnico', descripcion: 'Técnico que respondió' },
      { nombre: 'mensaje_html', descripcion: 'Respuesta (HTML; usar con triple llave)' },
    ],
    cuerpoHtml: envoltura(
      'Soporte respondió tu ticket',
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px">Hola {{solicitante}}, <strong>{{tecnico}}</strong> respondió tu ticket <strong>{{folio}}</strong>:</p>
        <div style="margin:0 0 16px;padding:14px 16px;background:#FAFBFC;border:1px solid #DDE3E9;border-radius:8px;color:#17222D;font-size:14px">{{{mensaje_html}}}</div>${boton}`,
    ),
  },
  {
    codigo: 'TICKET_NUEVO_SOPORTE',
    nombre: 'Aviso de ticket nuevo a soporte',
    descripcion: 'Se envía al buzón de soporte cuando se crea un ticket (solo si el ajuste "correo.aviso_soporte_activo" está encendido).',
    asunto: 'Nuevo ticket: {{folio}} — Urgencia {{urgencia}}',
    variables: [
      ...VARIABLES_TICKET,
      { nombre: 'copias', descripcion: 'Correos que recibieron copia (o "—")' },
      { nombre: 'descripcion_html', descripcion: 'Descripción (HTML; usar con triple llave)' },
    ],
    cuerpoHtml: envoltura(
      'Nuevo ticket pendiente',
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px">{{solicitante}} ({{solicitante_email}}) creó un ticket nuevo.</p>
        <p style="margin:0 0 16px;color:#4A5966;font-size:14px">En copia: {{copias}}</p>${tablaDatos}
        <div style="margin:16px 0 0;padding:14px 16px;background:#FAFBFC;border:1px solid #DDE3E9;border-radius:8px;color:#17222D;font-size:14px">{{{descripcion_html}}}</div>${boton}`,
    ),
  },
];
