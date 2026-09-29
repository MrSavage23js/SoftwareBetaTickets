import { defineConfig } from 'tsup';

// Empaqueta la API en dist/ incluyendo el paquete compartido (que se publica como TypeScript fuente).
export default defineConfig({
  entry: { server: 'src/server.ts', cli: 'src/db/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  noExternal: ['@mesa/shared'],
});
