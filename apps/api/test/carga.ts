// Prueba de carga: siembra N tickets en la BD de PRUEBAS y mide las consultas típicas de la bandeja.
// Uso: npm run carga -w @mesa/api            (N=20000 por omisión; CARGA_TICKETS=50000 para más)
// Meta del plan (fase 7): p95 < 300 ms por consulta con 20,000 tickets.
import { ENV_PRUEBAS } from '../vitest.config';

Object.assign(process.env, ENV_PRUEBAS);
const N = Number(process.env.CARGA_TICKETS ?? 20_000);

const { sql } = await import('kysely');
const { db, cerrarBD } = await import('../src/db/conexion');
const { migrarAlUltimo } = await import('../src/db/migrador');
const { reiniciarBD, entrar } = await import('./ayudas');
const { formatearFolio } = await import('@mesa/shared');

await migrarAlUltimo();
const f = await reiniciarBD();
const departamentos = (await db.selectFrom('departamentos').select(['id', 'codigo']).execute()) as { id: number; codigo: string }[];
const empresas = (await db.selectFrom('empresas').select(['id', 'codigo']).execute()) as { id: number; codigo: string }[];
const tipos = (await db.selectFrom('tipos_solicitud').select(['id', 'codigo']).execute()) as { id: number; codigo: string }[];
const modulos = (await db.selectFrom('modulos').select('id').execute()).map((m) => m.id);
const estatus = ['PENDIENTE', 'EN_PROCESO', 'PAUSADO', 'COMPLETADO', 'COMPLETADO', 'COMPLETADO'];
const palabras = ['carta', 'porte', 'factura', 'inventario', 'nómina', 'póliza', 'cancelación', 'proveedor', 'almacén', 'cliente', 'banco', 'traspaso'];

console.log(`Sembrando ${N.toLocaleString('es-MX')} tickets…`);
const t0 = Date.now();
const consecutivo = new Map<string, number>();
const LOTE = 1000;
for (let i = 0; i < N; i += LOTE) {
  const filas = [];
  for (let j = i; j < Math.min(i + LOTE, N); j++) {
    const e = empresas[j % empresas.length]!;
    const t = tipos[(j * 7) % tipos.length]!;
    const dep = departamentos[j % departamentos.length]!;
    const creado = new Date(Date.now() - (N - j) * 20 * 60_000);
    const clave = dep.codigo;
    const n = (consecutivo.get(clave) ?? 0) + 1;
    consecutivo.set(clave, n);
    const est = estatus[j % estatus.length]!;
    const texto = Array.from({ length: 12 }, (_, k) => palabras[(j + k * 3) % palabras.length]).join(' ');
    filas.push({
      folio: formatearFolio(dep.codigo, n),
      departamento_id: dep.id,
      tipo_id: t.id,
      empresa_id: e.id,
      modulo_id: modulos[j % modulos.length]!,
      concepto: `${palabras[j % palabras.length]} ${j}`,
      folios_ref: `F${100000 + j}`,
      descripcion_html: `<p>${texto}</p>`,
      descripcion_texto: texto,
      estatus: est,
      solicitante_id: j % 2 ? f.u1 : f.u2,
      creado_por_id: j % 2 ? f.u1 : f.u2,
      asignado_a_id: est === 'PENDIENTE' ? null : j % 3 ? f.admin : f.tecnico,
      cerrado_por_id: null,
      id_anterior: null,
      creado_at: creado,
    });
  }
  await db.insertInto('tickets').values(filas).execute();
}
await db
  .insertInto('folio_contadores')
  .values([...consecutivo].map(([clave, ultimo]) => ({ departamento: clave, anio: 0, ultimo_consecutivo: ultimo })))
  .execute();
await sql`ANALYZE tickets`.execute(db);
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

const primerId = (await db.selectFrom('tickets').select('id').orderBy('id').limit(1).executeTakeFirstOrThrow()).id;
const admin = await entrar('admin_prueba');
const u1 = await entrar('usuario_uno');

const casos: [string, () => Promise<{ status: number }>][] = [
  ['Bandeja (todos, página 1)', () => admin.get('/tickets')],
  ['Bandeja pestaña Pendientes', () => admin.get('/tickets?estatus=PENDIENTE')],
  ['Bandeja página 200', () => admin.get('/tickets?pagina=200')],
  ['Filtro empresa + tipo + fechas', () => admin.get(`/tickets?empresaId=${f.empresaAS}&tipoId=${f.tipoCA}&desde=2025-01-01&hasta=2026-12-31`)],
  ['Filtro por técnico', () => admin.get(`/tickets?asignadoAId=${f.tecnico}&estatus=EN_PROCESO`)],
  ['Búsqueda por folio', () => admin.get('/tickets?q=SIS-0100')],
  ['Filtro por departamento', () => admin.get(`/tickets?departamentoId=${departamentos[0]!.id}`)],
  ['Búsqueda por texto (fulltext)', () => admin.get('/tickets?q=inventario%20proveedor')],
  ['Búsqueda por empresa', () => admin.get('/tickets?q=Asturcones')],
  ['Kanban: columna Completado (50)', () => admin.get('/tickets?estatus=COMPLETADO&porPagina=50')],
  ['Mis tickets (solicitante)', () => u1.get('/tickets')],
  ['Detalle de ticket', () => admin.get(`/tickets/${primerId}`)],
];

const REPETICIONES = 30;
const pct = (v: number[], p: number) => v.sort((a, b) => a - b)[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)]!;
console.log('Consulta'.padEnd(36), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8));
let peor = 0;
for (const [nombre, hacer] of casos) {
  await hacer(); // calentar
  const tiempos: number[] = [];
  for (let i = 0; i < REPETICIONES; i++) {
    const t = performance.now();
    const r = await hacer();
    tiempos.push(performance.now() - t);
    if (r.status !== 200) throw new Error(`${nombre}: respondió ${r.status}`);
  }
  const p95 = pct(tiempos, 95);
  peor = Math.max(peor, p95);
  console.log(nombre.padEnd(36), pct(tiempos, 50).toFixed(0).padStart(8), p95.toFixed(0).padStart(8), p95 > 300 ? '  ⚠' : '');
}
console.log(`\nPeor p95: ${peor.toFixed(0)} ms (meta: < 300 ms) → ${peor < 300 ? 'CUMPLE' : 'NO CUMPLE'}`);
await reiniciarBD();
await cerrarBD();
process.exit(peor < 300 ? 0 : 1);
