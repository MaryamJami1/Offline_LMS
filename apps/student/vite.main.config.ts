import { defineConfig } from 'vite';
import { sourceResolve } from '../../source-condition.js';

// Electron's main process as one ES module, with the workspace packages and
// zod bundled in, so the installer needs no node_modules (PR c).
export default defineConfig({
  ...sourceResolve,
  ssr: { ...sourceResolve.ssr, noExternal: true },
  build: {
    ssr: 'src/main/main.ts',
    outDir: 'dist/main',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    rollupOptions: {
      external: ['electron', /^node:/],
      output: { format: 'esm', entryFileNames: 'main.js' },
    },
  },
});
