import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { caddyfilePolicy } from './src/csp.js';
import { sourceResolve } from '../../source-condition.js';

// In development the panel runs on Vite and sends /api to the server on this
// machine; on the lab server, Caddy serves both from one address (02).
const SERVER = process.env['LINGUALAB_SERVER'] ?? 'http://localhost:3000';

export default defineConfig({
  ...sourceResolve,
  plugins: [react(), tailwindcss()],
  // The dev server injects inline scripts for hot reload, so only the built
  // panel that preview serves runs under the lab server's policy.
  server: { port: 5173, proxy: { '/api': SERVER } },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': SERVER },
    headers: { 'Content-Security-Policy': caddyfilePolicy() },
  },
});
