// Arma la aplicación Express sin abrir el puerto (así la pueden usar las pruebas con Supertest).
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, RAIZ, RUTAS } from './config/env';
import { bdDisponible } from './db/conexion';
import { ErrorApp } from './lib/errores';
import { logger } from './lib/logger';
import { proteccionCsrf } from './middleware/csrf';
import { manejarErrores, rutaNoEncontrada } from './middleware/errores';
import { limiteGeneral } from './middleware/limites';
import { cargarSesion, requiereSesion } from './middleware/sesion';
import { rutasAdjuntos } from './modulos/adjuntos/rutas';
import { rutasAjustes } from './modulos/ajustes/rutas';
import { rutasAuth } from './modulos/auth/rutas';
import { rutasCatalogos } from './modulos/catalogos/rutas';
import { rutasCorreos } from './modulos/correos/rutas';
import { rutasTickets } from './modulos/tickets/rutas';
import { rutasUsuarios } from './modulos/usuarios/rutas';

// Versión del package.json raíz (funciona igual si se arranca con npm, node o como servicio).
const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'desconocida';
  }
})();

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID().slice(0, 8);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Registro de accesos a la API (para investigar incidentes): quién, qué, resultado y duración.
      // Los archivos de la web y /health no se registran. Nunca incluye cuerpos, cookies ni tokens.
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => !req.url?.startsWith('/api/') },
      customProps: (req) => ({ usuario: (req as express.Request).usuario?.id }),
      serializers: {
        // Solo la ruta, sin parámetros de búsqueda (pueden contener datos personales).
        req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0], ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // El sistema es interno: que ningún buscador lo indexe aunque sea accesible desde internet.
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // El editor aplica color con style="…" en línea; no hay CSS externo.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
      strictTransportSecurity: env.COOKIE_SECURE ? { maxAge: 15_552_000 } : false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  app.get('/health', async (_req, res) => {
    const bd = await bdDisponible();
    res.status(bd ? 200 : 503).json({
      estado: bd ? 'ok' : 'degradado',
      bd: bd ? 'ok' : 'sin conexión',
      version: VERSION,
      activoDesdeSeg: Math.round(process.uptime()),
    });
  });

  // ---------------------------------------------------------------- API
  const api = Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(express.urlencoded({ extended: false, limit: '100kb' }));
  api.use(cookieParser());
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(cargarSesion);
  api.use(limiteGeneral);
  api.use(proteccionCsrf);

  api.use('/auth', rutasAuth);
  api.use(requiereSesion);
  // Con contraseña asignada por el admin, solo se permite /auth (cambiarla o salir).
  api.use((req, _res, next) => {
    if (req.usuario?.debeCambiarPassword) {
      throw new ErrorApp(403, 'CAMBIAR_PASSWORD', 'Debes cambiar tu contraseña antes de continuar.');
    }
    next();
  });
  api.use('/usuarios', rutasUsuarios);
  api.use('/catalogos', rutasCatalogos);
  api.use('/tickets', rutasTickets);
  api.use('/adjuntos', rutasAdjuntos);
  api.use('/correos', rutasCorreos);
  api.use('/ajustes', rutasAjustes);
  api.use(rutaNoEncontrada);

  app.use('/api', api);

  // ---------------------------------------------------------------- Web (compilada)
  if (existsSync(RUTAS.web)) {
    app.use(
      express.static(RUTAS.web, {
        index: false,
        setHeaders: (res, ruta) => {
          if (ruta.includes(`${sep}assets${sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // Cualquier otra ruta es de la aplicación de una sola página (React Router decide qué mostrar).
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(RUTAS.web, 'index.html'));
    });
  }

  app.use(manejarErrores);
  return app;
}
