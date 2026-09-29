// Sanitización de HTML en servidor (DECISIONES D12). Todo HTML que escribe un usuario pasa por aquí
// ANTES de guardarse; la web lo muestra tal cual, así que esta es la única barrera contra XSS.
import sanitizeHtml from 'sanitize-html';

/** URL interna de un adjunto: /api/adjuntos/<uuid>. Es lo único que puede ir en <img src>. */
export const RUTA_ADJUNTO = /^\/api\/adjuntos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

const OPCIONES_CONTENIDO: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ol', 'ul', 'li', 'a', 'span', 'img', 'blockquote', 'code', 'pre', 'h3', 'h4', 'hr'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
    img: ['src', 'alt', 'width', 'height'],
    ol: ['start'],
  },
  allowedStyles: { span: { color: [COLOR] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: [] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (tagName, attribs) => ({
      tagName,
      attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' },
    }),
  },
  exclusiveFilter: (frame) =>
    // Imágenes: solo adjuntos del propio sistema (nada de data:, http externos ni rastreadores).
    frame.tag === 'img' && !RUTA_ADJUNTO.test(frame.attribs.src ?? ''),
};

export function sanitizarContenido(html: string): string {
  return sanitizeHtml(html ?? '', OPCIONES_CONTENIDO).trim();
}

/** Texto plano (para búsqueda, correos en texto y validar que no esté vacío). */
export function htmlATexto(html: string): string {
  return sanitizeHtml(
    (html ?? '').replace(/<\/(p|li|h3|h4|blockquote|pre)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** ¿El HTML tiene contenido real (texto o imagen)? Un editor vacío deja "<p></p>". */
export function tieneContenido(html: string): boolean {
  return htmlATexto(html).length > 0 || /<img\s/i.test(html);
}

/** uuid de los adjuntos referenciados en <img src="/api/adjuntos/…">. */
export function uuidsEnLinea(html: string): string[] {
  const salida = new Set<string>();
  for (const m of html.matchAll(/<img[^>]+src="(\/api\/adjuntos\/[0-9a-f-]{36})"/gi)) {
    const u = RUTA_ADJUNTO.exec(m[1] ?? '');
    if (u?.[1]) salida.add(u[1].toLowerCase());
  }
  return [...salida];
}

// Plantillas de correo: los admins pueden usar tablas y estilos en línea (Outlook los necesita),
// pero nada de scripts, formularios, iframes ni manejadores de eventos.
const OPCIONES_CORREO: sanitizeHtml.IOptions = {
  allowedTags: [
    ...OPCIONES_CONTENIDO.allowedTags as string[],
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'div', 'h1', 'h2', 'center',
  ],
  allowedAttributes: {
    '*': ['style', 'align', 'valign', 'width', 'height', 'role', 'cellpadding', 'cellspacing', 'border', 'bgcolor'],
    a: ['href', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // href="{{url_ticket}}" es una variable, no un esquema: se deja pasar y se valida al sustituirla.
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitizarPlantillaCorreo(html: string): string {
  // sanitize-html descartaría href="{{url_ticket}}" por no tener esquema; se protege temporalmente.
  const protegido = html.replace(/href="\{\{\s*([a-z_]+)\s*\}\}"/gi, 'href="https://variable.invalid/$1"');
  return sanitizeHtml(protegido, OPCIONES_CORREO).replace(
    /href="https:\/\/variable\.invalid\/([a-z_]+)"/gi,
    'href="{{$1}}"',
  );
}
