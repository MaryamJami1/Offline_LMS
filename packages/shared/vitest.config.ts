import { defineConfig } from 'vitest/config';
import { sourceResolve } from '../../source-condition.js';

export default defineConfig({
  ...sourceResolve,
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        branches: 70,
      },
    },
  },
});
