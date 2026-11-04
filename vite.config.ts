import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'apps/desktop',
  base: './',
  plugins: [
    react(),
    {
      name: 'local-development-csp',
      transformIndexHtml(html, context) {
        if (!context.server) return html;
        const address = context.server.httpServer?.address();
        if (!address || typeof address === 'string') throw Error('DEV_SERVER_UNAVAILABLE');
        return html
          .replace("connect-src 'none'", `connect-src 'self' ws://127.0.0.1:${address.port}`)
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
      },
    },
  ],
  // Let the OS reserve a free loopback port atomically for each instance.
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
