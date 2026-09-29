#!/usr/bin/env node
// Servidor estático mínimo que imita GitHub Pages (sirve una carpeta bajo una subruta).
// Uso: node scripts/servir-estatico.mjs <carpeta> <puerto> </prefijo/>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [carpeta = 'demo-github-pages', puerto = '4173', prefijo = '/Software-Tickets/'] = process.argv.slice(2);
const RAIZ = resolve(carpeta);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!ruta.startsWith(prefijo)) return res.writeHead(302, { Location: prefijo }).end();
  const rel = normalize(ruta.slice(prefijo.length) || 'index.html');
  if (rel.startsWith('..')) return res.writeHead(400).end();
  try {
    res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] ?? 'application/octet-stream' }).end(await readFile(join(RAIZ, rel)));
  } catch {
    res.writeHead(404, { 'Content-Type': TIPOS['.html'] }).end(await readFile(join(RAIZ, '404.html')).catch(() => 'No encontrado'));
  }
}).listen(Number(puerto), () => console.log(`http://localhost:${puerto}${prefijo}`));
