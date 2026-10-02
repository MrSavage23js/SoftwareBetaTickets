// El aviso de ticket nuevo a sistemas lleva la urgencia en el asunto, el correo de quien lo reporta y
// a quién se envió copia. Solo cambia el asunto y la frase de entrada si el admin no los había editado.
import { sql, type Kysely } from 'kysely';

const ASUNTO: [antes: string, despues: string] = ['[{{folio}}] Nuevo ticket · {{empresa}} · {{tipo}}', 'Nuevo ticket: {{folio}} — Urgencia {{urgencia}}'];
const ENTRADA: [antes: string, despues: string] = [
  '{{solicitante}} creó un ticket nuevo.</p>',
  '{{solicitante}} ({{solicitante_email}}) creó un ticket nuevo.</p>\n        <p style="margin:0 0 16px;color:#4A5966;font-size:14px">En copia: {{copias}}</p>',
];
const VARIABLES = [
  { nombre: 'solicitante_email', descripcion: 'Correo del solicitante' },
  { nombre: 'copias', descripcion: 'Correos que recibieron copia (o "—")' },
];

async function aplicar(db: Kysely<unknown>, [asuntoA, asuntoB]: [string, string], [entradaA, entradaB]: [string, string]) {
  await sql`UPDATE plantillas_correo SET asunto = ${asuntoB} WHERE codigo = 'TICKET_NUEVO_SOPORTE' AND asunto = ${asuntoA}`.execute(db);
  await sql`UPDATE plantillas_correo SET cuerpo_html = REPLACE(cuerpo_html, ${entradaA}, ${entradaB}) WHERE codigo = 'TICKET_NUEVO_SOPORTE'`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, ASUNTO, ENTRADA);
  // La lista de variables solo se muestra en el editor de plantillas; se agregan las nuevas si faltan.
  for (const v of VARIABLES) {
    await sql`UPDATE plantillas_correo SET variables = JSON_ARRAY_APPEND(variables, '$', CAST(${JSON.stringify(v)} AS JSON))
      WHERE codigo IN ('TICKET_CREADO', 'TICKET_CERRADO', 'TICKET_RESPUESTA', 'TICKET_NUEVO_SOPORTE')
        AND (${v.nombre} = 'solicitante_email' OR codigo = 'TICKET_NUEVO_SOPORTE')
        AND NOT JSON_CONTAINS(variables, JSON_OBJECT('nombre', ${v.nombre}))`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await aplicar(db, [ASUNTO[1], ASUNTO[0]], [ENTRADA[1], ENTRADA[0]]);
}
