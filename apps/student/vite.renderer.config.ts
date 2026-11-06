import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { withPolicy } from './src/content-security-policy.js';
import { sourceResolve } from '../../source-condition.js';

/** The built page carries its own Content-Security-Policy; the dev server's inline scripts would break it. */
function contentSecurityPolicy(): Plugin {
  return { name: 'student-csp', apply: 'build', transformIndexHtml: (html) => withPolicy(html) };
}

// The screens, loaded by Electron from dist/renderer: every path is relative.
export default defineConfig({
  ...sourceResolve,
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: { port: 5174, strictPort: true },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
