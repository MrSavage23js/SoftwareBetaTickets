import { useId, useRef, useState } from 'react';
import type { AdjuntoInfo } from '@mesa/shared';
import { fmtTamano } from '../lib/formato';
import { useSesion } from '../sesion/Sesion';
import { Icono } from './Icono';
import { useAvisos } from './ui';

/** Zona para elegir o arrastrar archivos. Valida tipo, tamaño y cantidad antes de enviarlos. */
export function SelectorArchivos({
  archivos,
  alCambiar,
  compacto,
}: {
  archivos: File[];
  alCambiar: (a: File[]) => void;
  compacto?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const limites = usuario?.adjuntos ?? { maxMb: 10, maxPorMensaje: 5, tipos: [] };

  function agregar(lista: FileList | null) {
    const nuevos = [...(lista ?? [])];
    const aceptados: File[] = [];
    for (const f of nuevos) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (limites.tipos.length && !limites.tipos.includes(ext)) {
        avisar(`No se permiten archivos .${ext}. Tipos permitidos: ${limites.tipos.join(', ')}.`, 'mal');
      } else if (f.size > limites.maxMb * 1024 * 1024) {
        avisar(`"${f.name}" pesa más de ${limites.maxMb} MB.`, 'mal');
      } else if (f.size === 0) {
        avisar(`"${f.name}" está vacío.`, 'mal');
      } else aceptados.push(f);
    }
    const total = [...archivos, ...aceptados];
    if (total.length > limites.maxPorMensaje) {
      avisar(`Puedes adjuntar como máximo ${limites.maxPorMensaje} archivos.`, 'mal');
    }
    alCambiar(total.slice(0, limites.maxPorMensaje));
  }

  return (
    <div>
      {compacto ? (
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          <Icono n="clip" t="s" />
          Adjuntar
        </button>
      ) : (
        <label
          className={`drop ${encima ? 'encima' : ''}`}
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            agregar(e.dataTransfer.files);
          }}
        >
          <Icono n="upload" />
          Elige un archivo o arrástralo aquí
          <span className="help" style={{ margin: 0 }}>
            (máx. {limites.maxPorMensaje}, {limites.maxMb} MB c/u)
          </span>
        </label>
      )}
      <input
        ref={input}
        id={id}
        className="sr"
        type="file"
        multiple
        accept={limites.tipos.map((t) => `.${t}`).join(',')}
        onChange={(e) => {
          agregar(e.target.files);
          e.target.value = '';
        }}
      />
      {archivos.length > 0 && (
        <div className="archivos">
          {archivos.map((a, i) => (
            <div className="archivo" key={`${a.name}-${i}`}>
              <Icono n="file" t="s" />
              <span className="nom">{a.name}</span>
              <span className="tam">{fmtTamano(a.size)}</span>
              <button type="button" className="icon-btn chico" style={{ border: 0 }} aria-label={`Quitar ${a.name}`} onClick={() => alCambiar(archivos.filter((_, j) => j !== i))}>
                <Icono n="x" t="s" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lista de adjuntos ya guardados (enlaces de descarga protegidos por sesión). */
export function ListaAdjuntos({ adjuntos }: { adjuntos: AdjuntoInfo[] }) {
  if (!adjuntos.length) return null;
  return (
    <div className="archivos">
      {adjuntos.map((a) => (
        <a key={a.uuid} className="archivo" href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Icono n="clip" t="s" />
          <span className="nom">{a.nombre}</span>
          <span className="tam">{fmtTamano(a.tamano)}</span>
        </a>
      ))}
    </div>
  );
}
