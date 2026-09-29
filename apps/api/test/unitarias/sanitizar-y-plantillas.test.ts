import { describe, expect, it } from 'vitest';
import { finDiaLocal, inicioDiaLocal } from '../../src/lib/fechas';
import { htmlATexto, sanitizarContenido, sanitizarPlantillaCorreo, tieneContenido, uuidsEnLinea } from '../../src/lib/sanitizar';
import { renderizarHtml, renderizarTexto } from '../../src/modulos/correos/plantillas';
import { esperaTrasIntento } from '../../src/modulos/correos/trabajador';

const UUID = '0b1f5a2c-3d4e-4f60-8a9b-0c1d2e3f4a5b';

describe('sanitización de HTML (XSS)', () => {
  const casos: [string, string][] = [
    ['<script>alert(1)</script><p>hola</p>', '<p>hola</p>'],
    ['<p onclick="alert(1)">x</p>', '<p>x</p>'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<img src="data:image/png;base64,AAAA">', ''],
    ['<img src="https://rastreador.com/pixel.gif">', ''],
    ['<a href="javascript:alert(1)">x</a>', '<a target="_blank" rel="noopener noreferrer nofollow">x</a>'],
    ['<iframe src="https://malo.com"></iframe>', ''],
    ['<svg><script>alert(1)</script></svg>', ''],
    ['<style>body{display:none}</style><p>x</p>', '<p>x</p>'],
    ['<span style="position:fixed;color:#ff0000">x</span>', '<span style="color:#ff0000">x</span>'],
    ['<span style="color:red">x</span>', '<span>x</span>'], // solo hex o rgb(), que es lo que genera el editor
    ['<span style="color:expression(alert(1))">x</span>', '<span>x</span>'],
    ['<form action="https://malo.com"><input name="p"></form>', ''],
  ];
  it.each(casos)('%s', (entrada, esperado) => {
    expect(sanitizarContenido(entrada)).toBe(esperado);
  });

  it('conserva el formato permitido del editor', () => {
    const html = '<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s></p><ol><li>1</li></ol><ul><li>2</li></ul><p><span style="color:#0e7c7b">e</span></p>';
    expect(sanitizarContenido(html)).toBe(html);
  });

  it('los enlaces se abren en otra pestaña sin acceso a la página', () => {
    expect(sanitizarContenido('<a href="https://ejemplo.com">x</a>')).toBe(
      '<a href="https://ejemplo.com" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it('permite imágenes solo si son adjuntos del sistema', () => {
    const img = `<img src="/api/adjuntos/${UUID}" alt="captura" />`;
    expect(sanitizarContenido(img)).toContain(`src="/api/adjuntos/${UUID}"`);
    expect(uuidsEnLinea(sanitizarContenido(img))).toEqual([UUID]);
    expect(sanitizarContenido('<img src="/api/adjuntos/../../etc/passwd">')).toBe('');
  });

  it('detecta contenido vacío del editor', () => {
    expect(tieneContenido('<p></p>')).toBe(false);
    expect(tieneContenido('<p> &nbsp; </p>')).toBe(false);
    expect(tieneContenido('<p>x</p>')).toBe(true);
    expect(tieneContenido(`<p><img src="/api/adjuntos/${UUID}"></p>`)).toBe(true);
  });

  it('convierte a texto plano para búsqueda y correos', () => {
    expect(htmlATexto('<p>Hola &amp; adiós</p><ul><li>uno</li><li>dos</li></ul>')).toBe('Hola & adiós\nuno\ndos');
  });
});

describe('plantillas de correo', () => {
  it('{{variable}} se escapa; {{{x_html}}} inserta HTML', () => {
    const r = renderizarHtml('<p>{{concepto}}</p>{{{resolucion_html}}}', {
      concepto: '<script>alert(1)</script>',
      resolucion_html: '<p><strong>listo</strong></p>',
    });
    expect(r).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p><strong>listo</strong></p>');
  });

  it('la triple llave NO inserta HTML en variables que no terminan en _html', () => {
    expect(renderizarHtml('{{{concepto}}}', { concepto: '<b>x</b>' })).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('variables vacías o desconocidas', () => {
    expect(renderizarHtml('[{{modulo}}][{{nada}}][{{{nada_html}}}]', { modulo: null })).toBe('[—][—][]');
  });

  it('el asunto no admite saltos de línea (inyección de cabeceras)', () => {
    expect(renderizarTexto('Ticket {{folio}}', { folio: 'A\r\nBcc: todos@empresa.com' })).toBe('Ticket A Bcc: todos@empresa.com');
  });

  it('las URL solo pueden apuntar al propio sistema', () => {
    expect(renderizarHtml('<a href="{{url_ticket}}">', { url_ticket: 'https://malo.com' })).toBe('<a href="http://localhost:3100">');
  });

  it('al guardar una plantilla se eliminan scripts pero se conservan variables en enlaces', () => {
    const r = sanitizarPlantillaCorreo('<table><tr><td style="color:red">x</td></tr></table><script>x</script><a href="{{url_ticket}}">Ver</a>');
    expect(r).not.toContain('<script');
    expect(r).toContain('href="{{url_ticket}}"');
    expect(r).toContain('<td style="color:red">x</td>');
  });
});

describe('reintentos de correo', () => {
  it('esperas progresivas con tope de 24 h', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(esperaTrasIntento)).toEqual([1, 5, 15, 60, 360, 1440, 1440, 1440]);
  });
});

describe('fechas en zona horaria local', () => {
  it('convierte el día local (Ciudad de México, UTC-6) a instantes UTC', () => {
    expect(inicioDiaLocal('2026-09-28').toISOString()).toBe('2026-09-28T06:00:00.000Z');
    expect(finDiaLocal('2026-09-28').toISOString()).toBe('2026-09-29T06:00:00.000Z');
  });
});
