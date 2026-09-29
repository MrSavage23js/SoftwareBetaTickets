import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo la web corre en :5180 y reenvía /api y /health a la API (:3100).
// En producción la API sirve la carpeta dist/ directamente (un solo proceso, sin CORS).
const API = process.env.API_URL ?? 'http://localhost:3100';

export default defineConfig(({ mode }) => ({
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
    // Demo de GitHub Pages: todos los archivos en un solo nivel (la subida web de GitHub no siempre acepta carpetas).
    assetsDir: mode === 'demo' ? '' : 'assets',
    // Sin mapas de código fuente en producción: no se publica el código original.
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    // Librerías en archivos aparte: cambian poco, así el navegador las conserva en caché entre versiones.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router', '@tanstack/react-query'],
          editor: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-text-style', '@tiptap/extensions'],
          zod: ['zod'],
        },
      },
    },
  },
}));
