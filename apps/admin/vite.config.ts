import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the panel runs on Vite and sends /api to the server on this
// machine; on the lab server, Caddy serves both from one address (02).
const SERVER = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': SERVER } },
  preview: { port: 4173, proxy: { '/api': SERVER } },
});
