// Cola de salida en BD. Encolar se hace DENTRO de la transacción de la operación (crear, cerrar…):
// si la operación falla no queda correo; si el envío falla, la operación ya quedó hecha y se reintenta.
import { env } from '../../config/env';
import type { Ejecutor } from '../../db/conexion';
import type { Destinatario } from '../../db/tipos';
import { htmlATexto } from '../../lib/sanitizar';
import { asuntoRespuesta, plantillaRaiz } from './hilos';
import { escaparHtml, renderizarHtml, renderizarTexto, type Variables } from './plantillas';

export const CODIGOS_PLANTILLA = {
  TICKET_CREADO: 'TICKET_CREADO',
  TICKET_CERRADO: 'TICKET_CERRADO',
  TICKET_RESPUESTA: 'TICKET_RESPUESTA',
  TICKET_NUEVO_SOPORTE: 'TICKET_NUEVO_SOPORTE',
  TICKET_CERRADO_SOPORTE: 'TICKET_CERRADO_SOPORTE',
} as const;

function depurar(lista: Destinatario[], excluir: Set<string> = new Set()): Destinatario[] {
  const vistos = new Set(excluir);
  const salida: Destinatario[] = [];
  for (const d of lista) {
    const email = d.email.trim().toLowerCase();
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    salida.push({ email, ...(d.nombre ? { nombre: d.nombre.slice(0, 120) } : {}) });
  }
  return salida;
}

const PLANTILLAS_CIERRE = new Set<string>([CODIGOS_PLANTILLA.TICKET_CERRADO, CODIGOS_PLANTILLA.TICKET_CERRADO_SOPORTE]);

/**
 * Avisos de cierre: además del asunto (que dice cómo terminó), el estatus final va al principio del
 * cuerpo: un texto oculto que Outlook muestra en la vista previa de la bandeja y una etiqueta chica
 * bajo el título (lo que debe resaltar es la resolución, no el estatus). Se pone aquí y no en la plantilla para que no se pierda si alguien la edita.
 */
function conEstatusFinal(html: string, variables: Variables): string {
  const estatus = typeof variables.estatus === 'string' ? variables.estatus : '';
  if (!estatus) return html;
  const noProcede = /no procede/i.test(estatus);
  const marca = noProcede ? '✖' : '✔';
  const e = escaparHtml(estatus.toUpperCase());
  const folio = typeof variables.folio === 'string' ? ` · ${escaparHtml(variables.folio)}` : '';
  const quien = typeof variables.tecnico === 'string' ? ` · cerrado por ${escaparHtml(variables.tecnico)}` : '';
  const previa = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${marca} ${e}${folio}${quien}</div>`;
  const [fondo, borde, tinta] = noProcede ? ['#FBE9E8', '#C62828', '#8C1F1F'] : ['#E3F5EA', '#1E8E4E', '#146038'];
  const recuadro = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${fondo};border:1px solid ${borde};border-radius:6px">
          <tr><td style="padding:5px 12px;color:${tinta};font-size:13px;font-weight:700;letter-spacing:1px">${marca} ${e}</td></tr>
        </table>`;
  const conRecuadro = /<\/h1>/i.test(html) ? html.replace(/<\/h1>/i, (m) => m + recuadro) : recuadro + html;
  return previa + conRecuadro;
}

/** Arma el correo con la plantilla y lo deja en la cola. Devuelve false si la plantilla está desactivada. */
export async function encolarCorreo(
  ex: Ejecutor,
  c: { plantilla: string; para: Destinatario[]; cc?: Destinatario[]; variables: Variables; ticketId?: number | null },
): Promise<boolean> {
  const p = await ex
    .selectFrom('plantillas_correo')
    .select(['asunto', 'cuerpo_html', 'activa'])
    .where('codigo', '=', c.plantilla)
    .executeTakeFirst();
  if (!p || !p.activa) return false;

  const para = depurar(c.para);
  if (!para.length) return false;
  const cc = depurar(c.cc ?? [], new Set(para.map((d) => d.email)));

  const variables: Variables = { empresa_sistema: env.APP_NOMBRE_EMPRESA, ...c.variables };
  const renderizado = renderizarHtml(p.cuerpo_html, variables);
  const html = PLANTILLAS_CIERRE.has(c.plantilla) ? conEstatusFinal(renderizado, variables) : renderizado;
  // El folio SIEMPRE va en el asunto (para identificarlo y buscarlo en Outlook), aunque se edite la plantilla.
  let asunto = renderizarTexto(p.asunto, variables);
  const folio = typeof variables.folio === 'string' ? variables.folio : null;
  if (folio && !asunto.includes(folio)) asunto = `[${folio}] ${asunto}`.slice(0, 250);
  // Respuestas de soporte: mismo asunto que el primer aviso con "RE:", para que Outlook las muestre
  // en esa conversación (cabeceras del hilo: hilos.ts). Los cierres conservan su propio asunto
  // ("Ticket cerrado: … — Completado"): se pidió que el estatus final siempre se vea en la bandeja.
  const raiz = plantillaRaiz(c.plantilla);
  if (c.ticketId && raiz && raiz !== c.plantilla && !PLANTILLAS_CIERRE.has(c.plantilla)) {
    const primero = await ex
      .selectFrom('correos_salida')
      .select('asunto')
      .where('ticket_id', '=', c.ticketId)
      .where('plantilla_codigo', '=', raiz)
      .orderBy('id')
      .executeTakeFirst();
    if (primero) asunto = asuntoRespuesta(primero.asunto);
  }
  await ex
    .insertInto('correos_salida')
    .values({
      plantilla_codigo: c.plantilla,
      ticket_id: c.ticketId ?? null,
      para: JSON.stringify(para),
      cc: cc.length ? JSON.stringify(cc) : null,
      asunto,
      cuerpo_html: html,
      cuerpo_texto: htmlATexto(html),
      estado: 'PENDIENTE',
      proximo_intento_at: new Date(),
      bloqueado_hasta: null,
      ultimo_error: null,
      transporte: null,
      id_mensaje_proveedor: null,
      enviado_at: null,
    })
    .execute();
  return true;
}
