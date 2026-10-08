// Avisos a soporte: el nombre del solicitante va en el asunto (se ve en la bandeja de Outlook sin abrir
// el correo) y en un recuadro destacado arriba del cuerpo. Las plantillas viven en la base y el seed no
// pisa las existentes, por eso se cambian aquí. Solo se reemplaza el texto original: si alguien ya editó
// la plantilla desde Correos → Plantillas, REPLACE no encuentra coincidencia y la deja como está.
import { sql, type Kysely } from 'kysely';

const BLOQUE = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;background:#EAF3F3;border-left:4px solid #028183">
          <tr><td style="padding:12px 16px">
            <div style="color:#4A5966;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Solicitante</div>
            <div style="color:#12202B;font-size:22px;font-weight:700;margin-top:2px">{{solicitante}}</div>
            <div style="color:#4A5966;font-size:14px">{{solicitante_email}}</div>
          </td></tr>
        </table>`;

const CAMBIOS = [
  {
    codigo: 'TICKET_NUEVO_SOPORTE',
    asunto: ['Nuevo ticket: {{folio}} — Urgencia {{urgencia}}', 'Nuevo ticket: {{folio}} — {{solicitante}} — Urgencia {{urgencia}}'],
    cuerpo: [
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px">{{solicitante}} ({{solicitante_email}}) creó un ticket nuevo.</p>`,
      BLOQUE,
    ],
  },
  {
    codigo: 'TICKET_CERRADO_SOPORTE',
    asunto: ['Ticket cerrado: {{folio}} — {{estatus}}', 'Ticket cerrado: {{folio}} — {{solicitante}} — {{estatus}}'],
    cuerpo: [
      `        <p style="margin:0 0 16px;color:#17222D;font-size:15px"><strong>{{tecnico}}</strong> cerró el ticket <strong>{{folio}}</strong> de {{solicitante}} ({{solicitante_email}}) el {{fecha_cierre}}.</p>`,
      `${BLOQUE}
        <p style="margin:0 0 16px;color:#17222D;font-size:15px"><strong>{{tecnico}}</strong> cerró el ticket <strong>{{folio}}</strong> el {{fecha_cierre}}.</p>`,
    ],
  },
];

async function aplicar(db: Kysely<unknown>, de: 0 | 1, a: 0 | 1): Promise<void> {
  for (const c of CAMBIOS) {
    await sql`
      UPDATE plantillas_correo
      SET asunto = CASE WHEN asunto = ${c.asunto[de]} THEN ${c.asunto[a]} ELSE asunto END,
          cuerpo_html = REPLACE(cuerpo_html, ${c.cuerpo[de]}, ${c.cuerpo[a]})
      WHERE codigo = ${c.codigo}
    `.execute(db);
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, 0, 1);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, 1, 0);
}
