import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One file at a time, whichever way vitest is launched: the server's
    // database and API specs share one PostgreSQL and empty it between files,
    // and in parallel they truncated each other's rows mid-test. The option is
    // read only from the root config, so a per-package setting is not enough
    // for `pnpm test:watch` or the pre-commit hook.
    fileParallelism: false,
    projects: [
      'apps/server',
      'apps/teacher',
      'apps/student',
      'apps/admin',
      'packages/shared',
      'packages/ui',
      'packages/test-utils',
    ],
  },
});
