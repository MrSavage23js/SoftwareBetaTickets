// Comandos de base de datos:
//   migrar       aplica migraciones pendientes
//   seed         inserta datos iniciales faltantes (idempotente)
//   estado       lista migraciones aplicadas y pendientes
//   crear-admin  --usuario X --email Y --password Z   crea un administrador adicional
import { parseArgs } from 'node:util';
import { esquemaPassword, USERNAME_REGEX } from '@mesa/shared';
import { cerrarBD } from './conexion';
import { migrador, migrarAlUltimo } from './migrador';
import { adminInicial, sembrar } from './seeds';

const salida = (t: string) => process.stdout.write(t + '\n');

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  switch (comando) {
    case 'migrar':
      await migrarAlUltimo();
      salida('Migraciones al día.');
      break;
    case 'seed':
      await sembrar();
      break;
    case 'estado': {
      const ms = await migrador.getMigrations();
      for (const m of ms) salida(`${m.executedAt ? '✔' : '·'} ${m.name}${m.executedAt ? `  (${m.executedAt.toISOString()})` : '  PENDIENTE'}`);
      break;
    }
    case 'crear-admin': {
      const { values } = parseArgs({
        args: resto,
        options: { usuario: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } },
      });
      if (!values.usuario || !values.email || !values.password) {
        salida('Uso: npm run crear-admin -- --usuario nombre --email correo@empresa.com --password "Secreta123"');
        process.exitCode = 1;
        break;
      }
      if (!USERNAME_REGEX.test(values.usuario)) throw new Error('Nombre de usuario inválido.');
      const p = esquemaPassword().safeParse(values.password);
      if (!p.success) throw new Error(p.error.issues[0]?.message);
      await adminInicial({ usuario: values.usuario, email: values.email, password: values.password });
      break;
    }
    default:
      salida('Comandos: migrar | seed | estado | crear-admin');
      process.exitCode = 1;
  }
}

main()
  .catch((e: unknown) => {
    process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => cerrarBD());
