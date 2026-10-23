// Correos: el recuadro del solicitante se hace más chico y la resolución, la respuesta y los campos del
// ticket más visibles (letra más grande, filete a la izquierda, filas separadas). La etiqueta del
// estatus final (✔ COMPLETADO / ✖ NO PROCEDE) se achica en cola.ts, porque no vive en la plantilla.
// Como en 0005: se reemplazan pedazos del texto original en todas las plantillas; lo que alguien ya
// editó desde Correos → Plantillas no coincide y se queda como está.
import { sql, type Kysely } from 'kysely';

const CAMBIOS: [string, string][] = [
  // Campos del ticket
  [
    '<td style="padding:6px 0;color:#4A5966;font-size:14px;width:140px;vertical-align:top">',
    '<td style="padding:8px 0;color:#4A5966;font-size:14px;width:140px;vertical-align:top;border-bottom:1px solid #E6EBEF">',
  ],
  [
    '<td style="padding:6px 0;color:#17222D;font-size:14px;font-weight:600">',
    '<td style="padding:8px 0;color:#12202B;font-size:15px;font-weight:700;border-bottom:1px solid #E6EBEF">',
  ],
  // Recuadro del solicitante
  ['background:#EAF3F3;border-left:4px solid #028183">', 'background:#EAF3F3;border-left:3px solid #028183">'],
  ['<tr><td style="padding:12px 16px">', '<tr><td style="padding:8px 14px">'],
  [
    '<div style="color:#4A5966;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Solicitante</div>',
    '<div style="color:#4A5966;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Solicitante</div>',
  ],
  ['font-size:22px;font-weight:700;margin-top:2px">{{solicitante}}', 'font-size:16px;font-weight:700;margin-top:1px">{{solicitante}}'],
  ['<div style="color:#4A5966;font-size:14px">{{solicitante_email}}</div>', '<div style="color:#4A5966;font-size:13px">{{solicitante_email}}</div>'],
  // Resolución (cierres) y respuesta de soporte
  [
    '<div style="margin:0 0 16px;padding:14px 16px;background:#EAF3F3;border:1px solid #BFDCDC;border-radius:8px;color:#17222D;font-size:14px"><div style="font-weight:700;margin-bottom:6px">Resolución</div>',
    '<div style="margin:0 0 20px;padding:16px 20px;background:#EAF3F3;border:1px solid #BFDCDC;border-left:5px solid #028183;border-radius:8px;color:#12202B;font-size:16px;line-height:1.5"><div style="color:#028183;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Resolución</div>',
  ],
  [
    '<div style="margin:0 0 16px;padding:14px 16px;background:#FAFBFC;border:1px solid #DDE3E9;border-radius:8px;color:#17222D;font-size:14px">{{{mensaje_html}}}',
    '<div style="margin:0 0 20px;padding:16px 20px;background:#FAFBFC;border:1px solid #DDE3E9;border-left:5px solid #028183;border-radius:8px;color:#12202B;font-size:16px;line-height:1.5">{{{mensaje_html}}}',
  ],
];

async function aplicar(db: Kysely<unknown>, de: 0 | 1, a: 0 | 1): Promise<void> {
  for (const c of CAMBIOS) {
    await sql`UPDATE plantillas_correo SET cuerpo_html = REPLACE(cuerpo_html, ${c[de]}, ${c[a]})`.execute(db);
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, 0, 1);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, 1, 0);
}
