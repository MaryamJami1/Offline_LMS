import { defineConfig } from 'vitest/config';
import { sourceResolve } from '../../source-condition.js';

export default defineConfig({
  ...sourceResolve,
  test: {
    globals: true,
    passWithNoTests: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
