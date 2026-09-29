// Ajustes editables desde la interfaz, con caché corta para no consultar la BD en cada petición.
import { DEFINICION_AJUSTES, type ClaveAjuste, type ValoresAjustes } from '@mesa/shared';
import { env } from '../../config/env';
import { db } from '../../db/conexion';
import { valoresInicialesAjustes } from '../../db/seeds';
import { errores } from '../../lib/errores';
import { logger } from '../../lib/logger';

const TTL_MS = 30_000;
let cache: { valores: ValoresAjustes; hasta: number } | undefined;

export async function obtenerAjustes(): Promise<ValoresAjustes> {
  if (cache && cache.hasta > Date.now()) return cache.valores;
  const valores = { ...valoresInicialesAjustes() } as Record<ClaveAjuste, unknown>;
  try {
    const filas = await db.selectFrom('ajustes').select(['clave', 'valor']).execute();
    for (const f of filas) {
      const def = DEFINICION_AJUSTES[f.clave as ClaveAjuste];
      if (!def) continue;
      const r = def.esquema.safeParse(f.valor);
      if (r.success) valores[f.clave as ClaveAjuste] = r.data;
      else logger.warn({ clave: f.clave }, 'Ajuste inválido en BD; se usa el valor por defecto');
    }
  } catch (e) {
    // Si la BD no responde se usan los últimos valores conocidos (o los de .env).
    if (cache) return cache.valores;
    logger.error({ err: e }, 'No se pudieron leer los ajustes; se usan valores de .env');
  }
  const final = valores as ValoresAjustes;
  // El tamaño de adjuntos nunca pasa el techo definido en el servidor.
  final['adjuntos.max_mb'] = Math.min(final['adjuntos.max_mb'], env.ADJUNTOS_TECHO_MB);
  cache = { valores: final, hasta: Date.now() + TTL_MS };
  return final;
}

export function invalidarAjustes(): void {
  cache = undefined;
}

export async function listarAjustes() {
  const valores = await obtenerAjustes();
  return (Object.keys(DEFINICION_AJUSTES) as ClaveAjuste[]).map((clave) => ({
    clave,
    valor: valores[clave],
    descripcion: DEFINICION_AJUSTES[clave].descripcion,
  }));
}

export async function actualizarAjustes(cambios: Record<string, unknown>, actorId: number) {
  const validos: { clave: ClaveAjuste; valor: unknown }[] = [];
  const campos: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(cambios)) {
    const def = DEFINICION_AJUSTES[clave as ClaveAjuste];
    if (!def) {
      campos[clave] = 'Ajuste desconocido.';
      continue;
    }
    const r = def.esquema.safeParse(valor);
    if (!r.success) campos[clave] = r.error.issues[0]?.message ?? 'Valor inválido.';
    else validos.push({ clave: clave as ClaveAjuste, valor: r.data });
  }
  const mb = validos.find((v) => v.clave === 'adjuntos.max_mb');
  if (mb && Number(mb.valor) > env.ADJUNTOS_TECHO_MB) {
    campos['adjuntos.max_mb'] = `No puede pasar de ${env.ADJUNTOS_TECHO_MB} MB (límite del servidor).`;
  }
  if (Object.keys(campos).length) throw errores.validacion('Revisa los ajustes marcados.', campos);

  const antes = await obtenerAjustes();
  await db.transaction().execute(async (tx) => {
    for (const v of validos) {
      await tx
        .insertInto('ajustes')
        .values({
          clave: v.clave,
          valor: JSON.stringify(v.valor),
          descripcion: DEFINICION_AJUSTES[v.clave].descripcion,
          actualizado_por_id: actorId,
        })
        .onDuplicateKeyUpdate({ valor: JSON.stringify(v.valor), actualizado_por_id: actorId })
        .execute();
    }
  });
  invalidarAjustes();
  return Object.fromEntries(validos.map((v) => [v.clave, { antes: antes[v.clave], despues: v.valor }]));
}
