// Cabeceras y comportamientos de seguridad pensados para un sistema accesible por toda la empresa.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/db/conexion';
import { anonimo, entrar, PASSWORD, reiniciarBD } from '../ayudas';

beforeAll(async () => {
  await reiniciarBD();
});
afterAll(async () => {
  await db.destroy();
});

describe('cabeceras de seguridad', () => {
  it('CSP estricta, sin iframes, sin sniffing, sin indexación y sin revelar la tecnología', async () => {
    const r = await anonimo().get('/api/auth/yo');
    const csp = r.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(r.headers['permissions-policy']).toContain('camera=()');
    expect(r.headers['referrer-policy']).toBe('same-origin');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('robots.txt prohíbe indexar todo el sitio', async () => {
    const r = await anonimo().get('/robots.txt');
    expect(r.text).toBe('User-agent: *\nDisallow: /\n');
  });

  it('cada respuesta trae un id de petición para rastrear errores', async () => {
    const r = await anonimo().get('/api/auth/yo');
    expect(r.headers['x-request-id']).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe('no se revela qué usuarios existen', () => {
  it('el mensaje es idéntico para un usuario real con contraseña mala y uno inexistente, en cada intento', async () => {
    for (let i = 0; i < 4; i++) {
      const real = await anonimo().post('/api/auth/login').send({ username: 'usuario_dos', password: `Mala${i}zz` });
      const falso = await anonimo().post('/api/auth/login').send({ username: 'fantasma', password: `Mala${i}zz` });
      expect(real.status).toBe(falso.status);
      expect(real.body).toEqual(falso.body);
    }
  });
});

describe('límites de tamaño', () => {
  it('un JSON enorme se rechaza con 413, no tumba el proceso', async () => {
    const c = await entrar('usuario_uno', PASSWORD);
    const r = await c.post('/auth/actividad', { relleno: 'x'.repeat(2 * 1024 * 1024) });
    expect(r.status).toBe(413);
    expect((await c.get('/auth/yo')).status).toBe(200);
  });
});
