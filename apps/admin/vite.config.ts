import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// El panel corre en desktop dentro de la clínica: no es PWA ni necesita
// service worker (docs/stack.md, Decisión 4).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  build: { sourcemap: true },
});
