// Volcado y carga de datos de PostgreSQL sin programas externos (no requiere pg_dump ni psql): sirve igual
// contra la base local que contra una remota (Render), desde cualquier PC con Node.
// Formato: un .jsonl.gz con una línea por fila: {"t":"tabla","f":{...columnas}}. El esquema NO va en el
// volcado: lo crean las migraciones (scripts/restaurar.mjs las aplica antes de cargar).
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import pg from 'pg';

const LOTE = 1000;
const ident = (s) => `"${s.replaceAll('"', '""')}"`;

export function cliente(url) {
  return new pg.Client({ connectionString: url, options: '-c TimeZone=UTC' });
}

/** Tablas de la aplicación ordenadas de modo que cada una va después de las que referencia. */
export async function tablasOrdenadas(c) {
  const { rows: tablas } = await c.query(
    `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'kysely_%' ORDER BY 1`,
  );
  const { rows: fks } = await c.query(`
    SELECT h.relname AS hija, p.relname AS padre
    FROM pg_constraint k JOIN pg_class h ON h.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = h.relnamespace
    WHERE k.contype = 'f' AND n.nspname = 'public' AND h.relname <> p.relname`);
  const pendientes = new Set(tablas.map((x) => x.t));
  const orden = [];
  while (pendientes.size) {
    const listas = [...pendientes].filter((t) => !fks.some((f) => f.hija === t && pendientes.has(f.padre)));
    if (!listas.length) throw new Error(`Referencias circulares entre tablas: ${[...pendientes].join(', ')}`);
    for (const t of listas) {
      orden.push(t);
      pendientes.delete(t);
    }
  }
  return orden;
}

/** Columnas que se guardan (sin las calculadas) y cuáles son JSON. */
async function columnas(c, tabla) {
  const { rows } = await c.query(
    `SELECT column_name AS n, data_type AS tipo FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER' ORDER BY ordinal_position`,
    [tabla],
  );
  return { nombres: rows.map((r) => r.n), json: new Set(rows.filter((r) => r.tipo === 'jsonb' || r.tipo === 'json').map((r) => r.n)) };
}

/** Escribe todas las filas en `archivo` (gzip). Copia consistente: una sola transacción de solo lectura. */
export async function volcar(url, archivo) {
  const c = cliente(url);
  await c.connect();
  const conteo = {};
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tablas = await tablasOrdenadas(c);
    async function* lineas() {
      for (const t of tablas) {
        const { nombres } = await columnas(c, t);
        conteo[t] = 0;
        await c.query(`DECLARE volcado NO SCROLL CURSOR FOR SELECT ${nombres.map(ident).join(', ')} FROM ${ident(t)}`);
        for (;;) {
          const { rows } = await c.query(`FETCH ${LOTE} FROM volcado`);
          if (!rows.length) break;
          conteo[t] += rows.length;
          yield rows.map((f) => JSON.stringify({ t, f }) + '\n').join('');
        }
        await c.query('CLOSE volcado');
      }
    }
    await pipeline(Readable.from(lineas()), createGzip({ level: 6 }), createWriteStream(archivo));
    await c.query('COMMIT');
    return { tablas, conteo };
  } finally {
    await c.end();
  }
}

/** Reemplaza todo el contenido de la base `url` con el de `archivo`, en una sola transacción. */
export async function cargar(url, archivo) {
  const c = cliente(url);
  await c.connect();
  const conteo = {};
  try {
    await c.query('BEGIN');
    const tablas = await tablasOrdenadas(c);
    await c.query(`TRUNCATE ${tablas.map(ident).join(', ')} RESTART IDENTITY`);
    const info = new Map();
    for (const t of tablas) info.set(t, await columnas(c, t));

    let tabla = null;
    let filas = [];
    const insertar = async () => {
      if (!filas.length) return;
      const { nombres, json } = info.get(tabla);
      // PostgreSQL admite hasta 65 535 parámetros por sentencia.
      const porLote = Math.max(1, Math.floor(60_000 / nombres.length));
      for (let i = 0; i < filas.length; i += porLote) {
        const parte = filas.slice(i, i + porLote);
        const valores = [];
        const tuplas = parte.map((f) => {
          const marcas = nombres.map((n) => {
            const v = f[n];
            valores.push(v === undefined ? null : json.has(n) && v !== null ? JSON.stringify(v) : v);
            return `$${valores.length}`;
          });
          return `(${marcas.join(', ')})`;
        });
        // OVERRIDING SYSTEM VALUE: conserva los ids originales aunque la columna sea de identidad.
        await c.query(`INSERT INTO ${ident(tabla)} (${nombres.map(ident).join(', ')}) OVERRIDING SYSTEM VALUE VALUES ${tuplas.join(', ')}`, valores);
      }
      conteo[tabla] = (conteo[tabla] ?? 0) + filas.length;
      filas = [];
    };

    const lector = createInterface({ input: createReadStream(archivo).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const linea of lector) {
      if (!linea) continue;
      const { t, f } = JSON.parse(linea);
      if (!info.has(t)) throw new Error(`El respaldo trae la tabla "${t}", que no existe en la base destino`);
      if (t !== tabla || filas.length >= LOTE) {
        await insertar();
        tabla = t;
      }
      filas.push(f);
    }
    await insertar();

    // Los contadores de las columnas de identidad siguen después del id más alto restaurado.
    const { rows: identidades } = await c.query(
      `SELECT table_name AS t, column_name AS n FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'`,
    );
    for (const { t, n } of identidades) {
      await c.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${ident(n)}) FROM ${ident(t)}), 0) + 1, false)`,
        [t, n],
      );
    }
    await c.query('COMMIT');
    return conteo;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
