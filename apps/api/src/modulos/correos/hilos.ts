// Hilos de conversación: los avisos de un mismo ticket llegan como respuestas al primero
// ("RE: …" en el asunto + Message-ID / In-Reply-To / References / Thread-Index), así Outlook
// y Gmail los agrupan en una sola conversación en vez de mostrar correos sueltos.
// Hay dos hilos por ticket, porque los leen personas distintas:
//   solicitante → Ticket creado · respuestas de soporte · Ticket cerrado
//   soporte     → Nuevo ticket · Ticket cerrado
import { createHash } from 'node:crypto';
import { env } from '../../config/env';

type Hilo = 'solicitante' | 'soporte';

// Mismos códigos que CODIGOS_PLANTILLA (cola.ts); van escritos aquí para no crear un import circular.
const HILOS: Record<string, { hilo: Hilo; raiz: string }> = {
  TICKET_CREADO: { hilo: 'solicitante', raiz: 'TICKET_CREADO' },
  TICKET_RESPUESTA: { hilo: 'solicitante', raiz: 'TICKET_CREADO' },
  TICKET_CERRADO: { hilo: 'solicitante', raiz: 'TICKET_CREADO' },
  TICKET_NUEVO_SOPORTE: { hilo: 'soporte', raiz: 'TICKET_NUEVO_SOPORTE' },
  TICKET_CERRADO_SOPORTE: { hilo: 'soporte', raiz: 'TICKET_NUEVO_SOPORTE' },
};

/** Plantilla con la que empieza el hilo de este correo (null si no pertenece a un hilo de ticket). */
export const plantillaRaiz = (plantilla: string): string | null => HILOS[plantilla]?.raiz ?? null;

export const asuntoRespuesta = (asuntoRaiz: string) => `RE: ${asuntoRaiz.replace(/^(re|rv|fw|fwd):\s*/i, '')}`.slice(0, 250);

export interface CabecerasHilo {
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers: Record<string, string>;
}

// El host de APP_URL va en los Message-ID: el ticket 5 de pruebas y el 5 de producción no se mezclan.
const dominio = () => new URL(env.APP_URL).hostname;

/**
 * Thread-Index de Outlook/Exchange: 22 bytes (6 de "fecha" + 16 de GUID) en el primer correo;
 * cada respuesta repite esos 22 y agrega 5. Se derivan del id del hilo para que sean estables.
 */
function threadIndex(idRaiz: string, respuesta: number): string {
  const h = createHash('sha256').update(idRaiz).digest();
  const base = Buffer.concat([Buffer.from([0x01]), h.subarray(0, 5), h.subarray(5, 21)]);
  if (!respuesta) return base.toString('base64');
  const hijo = Buffer.alloc(5);
  hijo.writeUInt32BE(respuesta, 0);
  return Buffer.concat([base, hijo]).toString('base64');
}

/** Cabeceras para encadenar el correo `correoId` en el hilo de su ticket. */
export function cabecerasHilo(c: { correoId: number; ticketId: number | null; plantilla: string | null; asunto: string }): CabecerasHilo | null {
  const def = c.plantilla ? HILOS[c.plantilla] : undefined;
  if (!def || !c.ticketId) return null;
  const raiz = `<ticket-${c.ticketId}.${def.hilo}@${dominio()}>`;
  const tema = c.asunto.replace(/^(re|rv|fw|fwd):\s*/i, '');
  if (c.plantilla === def.raiz) {
    return { messageId: raiz, headers: { 'Thread-Topic': tema, 'Thread-Index': threadIndex(raiz, 0) } };
  }
  return {
    messageId: `<ticket-${c.ticketId}.${def.hilo}.${c.correoId}@${dominio()}>`,
    inReplyTo: raiz,
    references: raiz,
    headers: { 'Thread-Topic': tema, 'Thread-Index': threadIndex(raiz, c.correoId) },
  };
}
