import { defineConfig } from 'vitest/config';
import { sourceResolve } from '../../source-condition.js';

// Screens run in jsdom; the main-process specs say `@vitest-environment node`.
export default defineConfig({
  ...sourceResolve,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
