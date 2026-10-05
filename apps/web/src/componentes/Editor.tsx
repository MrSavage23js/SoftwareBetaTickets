// Editor de texto enriquecido (barra de la maqueta: negrita, cursiva, subrayado, listas, color, enlace,
// imagen y quitar formato). Las imágenes se suben como adjunto y el HTML solo guarda su URL.
// OJO: el servidor vuelve a sanitizar todo; esto es comodidad, no seguridad.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { api, mensajeDe } from '../api/cliente';
import { useSesion } from '../sesion/Sesion';
import { Icono, type NombreIcono } from './Icono';
import { useAvisos } from './ui';

interface Props {
  id: string;
  valor: string;
  alCambiar: (html: string) => void;
  placeholder?: string;
  invalido?: boolean;
  corto?: boolean;
  etiqueta?: string;
  /** Si es false no se muestra el botón de imagen (p. ej. quien no puede subir archivos). */
  imagenes?: boolean;
  /** Botones extra al final de la barra; reciben cómo insertar HTML donde está el cursor. */
  extra?: (insertar: (html: string) => void) => ReactNode;
}

export function Editor({ id, valor, alCambiar, placeholder, invalido, corto, etiqueta, imagenes = true, extra }: Props) {
  const avisar = useAvisos();
  const { usuario } = useSesion();
  const [subiendo, setSubiendo] = useState(0);
  const [enlace, setEnlace] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: valor,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(etiqueta ? { 'aria-label': etiqueta } : {}),
        ...(invalido ? { 'aria-invalid': 'true' } : {}),
      },
      // Pegar o arrastrar imágenes: se suben como adjunto en lugar de incrustarse en base64.
      handlePaste: (_vista, evento) => subirDe(evento.clipboardData?.files),
      handleDrop: (_vista, evento) => subirDe((evento as DragEvent).dataTransfer?.files),
    },
    onUpdate: ({ editor: e }) => alCambiar(e.isEmpty ? '' : e.getHTML()),
  });

  const activo = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrita: !!e?.isActive('bold'),
      cursiva: !!e?.isActive('italic'),
      subrayado: !!e?.isActive('underline'),
      numerada: !!e?.isActive('orderedList'),
      vinetas: !!e?.isActive('bulletList'),
      enlace: !!e?.isActive('link'),
      color: (e?.getAttributes('textStyle').color as string | undefined) ?? '#17222d',
    }),
  });

  // Cuando el formulario se vacía desde fuera (después de enviar), se limpia el editor.
  useEffect(() => {
    if (editor && valor === '' && !editor.isEmpty) editor.commands.clearContent();
  }, [valor, editor]);

  function subirDe(lista: FileList | null | undefined): boolean {
    const imgs = [...(lista ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length || !imagenes) return false;
    void Promise.all(imgs.map(subir));
    return true;
  }

  async function subir(archivo: File) {
    const max = usuario?.adjuntos.maxMb ?? 10;
    if (archivo.size > max * 1024 * 1024) {
      avisar(`La imagen "${archivo.name}" pesa más de ${max} MB.`, 'mal');
      return;
    }
    setSubiendo((n) => n + 1);
    try {
      const r = await api.subirImagen(archivo);
      editor?.chain().focus().setImage({ src: r.url, alt: archivo.name }).run();
    } catch (e) {
      avisar(mensajeDe(e), 'mal');
    } finally {
      setSubiendo((n) => n - 1);
    }
  }

  const boton = (icono: NombreIcono, titulo: string, accion: () => void, presionado?: boolean) => (
    <button type="button" aria-label={titulo} title={titulo} aria-pressed={presionado} onMouseDown={(e) => e.preventDefault()} onClick={accion}>
      <Icono n={icono} t="s" />
    </button>
  );

  const aplicarEnlace = () => {
    if (!editor || enlace === null) return;
    const url = enlace.trim();
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run();
    setEnlace(null);
  };

  return (
    <div className={['rte', corto && 'corto'].filter(Boolean).join(' ')} aria-invalid={invalido || undefined}>
      <div className="tb" role="toolbar" aria-label="Formato de texto">
        {boton('bold', 'Negrita', () => editor?.chain().focus().toggleBold().run(), activo?.negrita)}
        {boton('italic', 'Cursiva', () => editor?.chain().focus().toggleItalic().run(), activo?.cursiva)}
        {boton('under', 'Subrayado', () => editor?.chain().focus().toggleUnderline().run(), activo?.subrayado)}
        <i />
        {boton('ol', 'Lista numerada', () => editor?.chain().focus().toggleOrderedList().run(), activo?.numerada)}
        {boton('list', 'Lista con viñetas', () => editor?.chain().focus().toggleBulletList().run(), activo?.vinetas)}
        <i />
        <label title="Color de texto" style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
          <span className="sr">Color de texto</span>
          <input type="color" value={activo?.color ?? '#17222d'} onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()} />
        </label>
        {boton('link', 'Insertar enlace', () => setEnlace(editor?.getAttributes('link').href ?? ''), activo?.enlace)}
        {imagenes && boton('image', 'Insertar imagen', () => archivoRef.current?.click())}
        {boton('clear', 'Quitar formato', () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}
        {subiendo > 0 && <span className="help" style={{ margin: '0 8px' }}>Subiendo imagen…</span>}
        {extra?.((html) => editor?.chain().focus().insertContent(html).run())}
      </div>
      {enlace !== null && (
        <div className="tb" style={{ gap: 8 }}>
          <input
            className="inp"
            style={{ minHeight: 36, flex: 1 }}
            placeholder="https://…"
            aria-label="Dirección del enlace"
            value={enlace}
            autoFocus
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                aplicarEnlace();
              }
              if (e.key === 'Escape') setEnlace(null);
            }}
          />
          <button type="button" className="btn p chico" style={{ width: 'auto' }} onClick={aplicarEnlace}>
            Aplicar
          </button>
          <button type="button" className="btn chico" style={{ width: 'auto' }} onClick={() => setEnlace(null)}>
            Cancelar
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      <input
        ref={archivoRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr"
        tabIndex={-1}
        onChange={(e) => {
          subirDe(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
