// Cola de salida en BD. Encolar se hace DENTRO de la transacción de la operación (crear, cerrar…):
// si la operación falla no queda correo; si el envío falla, la operación ya quedó hecha y se reintenta.
import { env } from '../../config/env';
import type { Ejecutor } from '../../db/conexion';
import type { Destinatario } from '../../db/tipos';
import { htmlATexto } from '../../lib/sanitizar';
import { renderizarHtml, renderizarTexto, type Variables } from './plantillas';

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
  const html = renderizarHtml(p.cuerpo_html, variables);
  // El folio SIEMPRE va en el asunto (para identificarlo y buscarlo en Outlook), aunque se edite la plantilla.
  let asunto = renderizarTexto(p.asunto, variables);
  const folio = typeof variables.folio === 'string' ? variables.folio : null;
  if (folio && !asunto.includes(folio)) asunto = `[${folio}] ${asunto}`.slice(0, 250);
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
