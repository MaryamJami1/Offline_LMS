import { defineConfig } from 'vitest/config';

// Every server spec talks to the test database, never the development one, so a
// spec that asserts exact counts cannot be thrown off by a developer's data and
// cannot damage it either. test/db/global-setup.ts creates and migrates it.
const databaseUrl = new URL(
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab',
);
databaseUrl.pathname = '/lingualab_test';

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/db/global-setup.ts'],
    env: {
      DATABASE_URL: databaseUrl.toString(),
      // The server refuses to start without one; this value is for tests only.
      JWT_SECRET: 'test-only-secret-at-least-32-characters',
    },
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
