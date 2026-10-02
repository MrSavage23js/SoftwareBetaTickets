// Búsquedas de texto sin distinguir mayúsculas ni acentos ("almacen" encuentra "Almacén"), como hacía
// MySQL con utf8mb4_0900_ai_ci. f_unaccent y la intercalación sin_acentos se crean en la migración base.
import { sql, type RawBuilder, type SqlBool } from 'kysely';

/** Escapa %, _ y \ para usar el texto del usuario dentro de un patrón LIKE. */
export const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/**
 * `columna LIKE patron` sin mayúsculas ni acentos. El COLLATE "default" es necesario porque varias columnas
 * usan la intercalación no determinista `sin_acentos`, con la que PostgreSQL no permite LIKE.
 */
export function coincide(columna: string, patron: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`f_unaccent(${sql.ref(columna)} COLLATE "default") ILIKE f_unaccent(${patron})`;
}
