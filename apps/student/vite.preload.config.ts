import { defineConfig } from 'vite';
import { sourceResolve } from '../../source-condition.js';

// A sandboxed preload may load nothing but Electron: one CommonJS file.
export default defineConfig({
  ...sourceResolve,
  ssr: { ...sourceResolve.ssr, noExternal: true },
  build: {
    ssr: 'src/preload/preload.ts',
    outDir: 'dist/preload',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'preload.cjs' },
    },
  },
});
