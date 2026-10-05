// Folio sin año (VEN-0001) con un consecutivo por departamento que nunca se reinicia (tickets/folio.ts).
// El contador continuo es la fila con anio = 0; arranca en el último número usado con el formato
// anterior (DEPTO-AAAA-NNNN), así SIS-2026-0007 sigue con SIS-0008. Las filas con año se conservan.
// También reactiva Recursos Humanos: ahora los usuarios eligen su departamento al crear el ticket.
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO folio_contadores (departamento, anio, ultimo_consecutivo)
    SELECT departamento, 0, MAX(ultimo_consecutivo) FROM folio_contadores WHERE anio > 0 GROUP BY departamento
    ON CONFLICT (departamento, anio) DO NOTHING
  `.execute(db);
  await sql`UPDATE departamentos SET activo = TRUE WHERE codigo = 'RH'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM folio_contadores WHERE anio = 0`.execute(db);
}
