// Archivos adjuntos (DECISIONES D14): fuera de la carpeta pública, con nombre aleatorio,
// tipo verificado por contenido (no por la extensión) y límites configurables desde Ajustes.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileTypeFromFile } from 'file-type';
import multer from 'multer';
import { env, RUTAS } from '../../config/env';
import { errores } from '../../lib/errores';
import { logger } from '../../lib/logger';
import { obtenerAjustes } from '../ajustes/servicio';

export interface ArchivoGuardado {
  uuid: string;
  nombreOriginal: string;
  rutaRelativa: string;
  mime: string;
  tamano: number;
  sha256: string;
}

/** Multer guarda primero en storage/tmp; después se valida y se mueve a su lugar definitivo. */
export const subida = multer({
  storage: multer.diskStorage({
    destination: RUTAS.temporales,
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.subida`),
  }),
  defParamCharset: 'utf8',
  limits: {
    fileSize: env.ADJUNTOS_TECHO_MB * 1024 * 1024,
    files: 20,
    fields: 10,
    fieldSize: 1024 * 1024,
    parts: 40,
  },
});

// Extensiones de texto: no tienen "firma" binaria; se aceptan si el contenido parece texto.
const TEXTO: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  json: 'application/json',
  log: 'text/plain',
};

// Qué tipos detectados son válidos para cada extensión declarada.
const EQUIVALENCIAS: Record<string, string[]> = {
  jpg: ['jpg'],
  jpeg: ['jpg'],
  doc: ['cfb'],
  xls: ['cfb'],
  ppt: ['cfb'],
  msg: ['cfb'],
  docx: ['docx', 'zip'],
  xlsx: ['xlsx', 'zip'],
  pptx: ['pptx', 'zip'],
  xml: ['xml'],
};

export const MIME_IMAGEN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

async function pareceTexto(ruta: string): Promise<boolean> {
  const f = await open(ruta, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await f.read(buf, 0, buf.length, 0);
    return !buf.subarray(0, bytesRead).includes(0);
  } finally {
    await f.close();
  }
}

function sha256De(ruta: string): Promise<string> {
  return new Promise((ok, mal) => {
    const h = createHash('sha256');
    createReadStream(ruta)
      .on('data', (c) => h.update(c))
      .on('end', () => ok(h.digest('hex')))
      .on('error', mal);
  });
}

export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .replace(/^.*[\\/]/, '')
    // Caracteres de control y los que Windows no permite en nombres de archivo.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .trim()
    .slice(-200);
  return limpio || 'archivo';
}

/** Valida y mueve los archivos subidos. Si uno falla, no se guarda ninguno. */
export async function procesarArchivos(
  archivos: Express.Multer.File[],
  opciones: { soloImagenes?: boolean; maxArchivos?: number } = {},
): Promise<ArchivoGuardado[]> {
  if (!archivos.length) return [];
  const ajustes = await obtenerAjustes();
  const maxBytes = ajustes['adjuntos.max_mb'] * 1024 * 1024;
  const maxArchivos = opciones.maxArchivos ?? ajustes['adjuntos.max_por_mensaje'];
  const permitidas = new Set(ajustes['adjuntos.tipos']);

  if (archivos.length > maxArchivos) {
    throw errores.archivo(`Puedes adjuntar como máximo ${maxArchivos} archivo${maxArchivos === 1 ? '' : 's'}.`);
  }

  const guardados: ArchivoGuardado[] = [];
  try {
    for (const a of archivos) {
      const nombre = nombreSeguro(a.originalname);
      const ext = extname(nombre).slice(1).toLowerCase();
      if (a.size === 0) throw errores.archivo(`"${nombre}" está vacío.`);
      if (a.size > maxBytes) throw errores.archivo(`"${nombre}" pesa más de ${ajustes['adjuntos.max_mb']} MB.`);
      if (!ext || !permitidas.has(ext)) {
        throw errores.archivo(`No se permiten archivos .${ext || '(sin extensión)'}. Tipos permitidos: ${[...permitidas].join(', ')}.`);
      }

      const detectado = await fileTypeFromFile(a.path);
      let mime: string;
      if (detectado) {
        const aceptables = EQUIVALENCIAS[ext] ?? [ext];
        if (!aceptables.includes(detectado.ext)) {
          throw errores.archivo(`El contenido de "${nombre}" no corresponde a un archivo .${ext}.`);
        }
        mime = detectado.mime;
      } else if (TEXTO[ext] && (await pareceTexto(a.path))) {
        mime = TEXTO[ext];
      } else {
        throw errores.archivo(`No se pudo verificar el contenido de "${nombre}".`);
      }
      if (opciones.soloImagenes && !MIME_IMAGEN.has(mime)) {
        throw errores.archivo('Solo se pueden insertar imágenes PNG, JPG, GIF o WEBP.');
      }

      const uuid = randomUUID();
      const ahora = new Date();
      const carpeta = `${ahora.getUTCFullYear()}/${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
      await mkdir(join(RUTAS.adjuntos, carpeta), { recursive: true });
      const rutaRelativa = `${carpeta}/${uuid}`;
      const sha256 = await sha256De(a.path);
      await rename(a.path, join(RUTAS.adjuntos, rutaRelativa));
      guardados.push({ uuid, nombreOriginal: nombre, rutaRelativa, mime, tamano: a.size, sha256 });
    }
    return guardados;
  } catch (e) {
    await borrarGuardados(guardados);
    throw e;
  }
}

/** Borra los temporales de multer (siempre, al terminar la petición). */
export async function limpiarTemporales(archivos: Express.Multer.File[] | undefined): Promise<void> {
  await Promise.all((archivos ?? []).map((a) => rm(a.path, { force: true }).catch(() => undefined)));
}

/** Si la transacción falla después de mover los archivos, se eliminan para no dejar huérfanos. */
export async function borrarGuardados(guardados: ArchivoGuardado[]): Promise<void> {
  for (const g of guardados) {
    await rm(join(RUTAS.adjuntos, g.rutaRelativa), { force: true }).catch((e: unknown) =>
      logger.warn({ err: e, uuid: g.uuid }, 'No se pudo borrar un adjunto huérfano'),
    );
  }
}

export const rutaAbsoluta = (rutaRelativa: string) => join(RUTAS.adjuntos, rutaRelativa);

export function archivosDe(req: { files?: unknown }): Express.Multer.File[] {
  const f = req.files;
  if (Array.isArray(f)) return f as Express.Multer.File[];
  if (f && typeof f === 'object') return Object.values(f as Record<string, Express.Multer.File[]>).flat();
  return [];
}

/** Tarea periódica: borra subidas interrumpidas que quedaron en storage/tmp (más de 1 hora). */
export async function limpiarCarpetaTemporal(): Promise<number> {
  const limite = Date.now() - 60 * 60_000;
  let borrados = 0;
  for (const nombre of await readdir(RUTAS.temporales).catch(() => [] as string[])) {
    const ruta = join(RUTAS.temporales, nombre);
    const s = await stat(ruta).catch(() => null);
    if (s?.isFile() && s.mtimeMs < limite) {
      await rm(ruta, { force: true }).catch(() => undefined);
      borrados++;
    }
  }
  return borrados;
}
