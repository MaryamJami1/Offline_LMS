import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/db/global-setup.ts'],
    // Database and API specs share one PostgreSQL and empty it between files,
    // so they run one file at a time instead of truncating each other's rows.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**'],
      thresholds: {
        lines: 80,
        branches: 70,
      },
    },
  },
});
