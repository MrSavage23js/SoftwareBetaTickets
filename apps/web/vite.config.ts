import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo la web corre en :5180 y reenvía /api y /health a la API (:3100).
// En producción la API sirve la carpeta dist/ directamente (un solo proceso, sin CORS).
const API = process.env.API_URL ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/health': { target: API },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
