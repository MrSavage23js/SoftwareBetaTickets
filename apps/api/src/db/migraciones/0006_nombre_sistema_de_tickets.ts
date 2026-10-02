// El producto se llama "Sistema de Tickets" (antes "Mesa de Ayuda"). Las plantillas de correo ya guardadas
// se actualizan solo en esas frases y en el color del encabezado; el resto de cada plantilla (que el
// admin pudo haber editado) no se toca.
import { sql, type Kysely } from 'kysely';

const CAMBIOS: [antes: string, despues: string][] = [
  ['Mesa de Ayuda ·', 'Sistema de Tickets ·'],
  ['desde la Mesa de Ayuda.', 'desde el Sistema de Tickets.'],
  ['background:#12202B;color:#FFFFFF;padding:18px 28px', 'background:#028183;color:#FFFFFF;padding:18px 28px'],
];

async function reemplazar(db: Kysely<unknown>, pares: [string, string][]) {
  for (const [a, b] of pares) {
    await sql`UPDATE plantillas_correo SET cuerpo_html = REPLACE(cuerpo_html, ${a}, ${b}), asunto = REPLACE(asunto, ${a}, ${b})`.execute(db);
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await reemplazar(db, CAMBIOS);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await reemplazar(db, CAMBIOS.map(([a, b]) => [b, a]));
}
