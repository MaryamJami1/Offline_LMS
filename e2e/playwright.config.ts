import { defineConfig } from '@playwright/test';
import {
  KIOSK_DATABASE_URL,
  KIOSK_SERVER_PORT,
  PANEL_PORT,
  RUN_DATABASE_URL,
  SERVER_PORT,
} from './src/support/run.ts';

/**
 * The journey runs the built server on a database of its own, made, migrated
 * and seeded for each run and dropped after it (src/support/database.ts), beside the PostgreSQL and LiveKit of
 * infra/docker-compose.yml. The built admin panel is served by `vite preview`,
 * which sends the Content-Security-Policy of infra/Caddyfile. Going through
 * Caddy over HTTPS comes when the server joins docker-compose (09, Phase 2).
 *
 * The kiosk test (T-STU-06) drives the built student app in Electron against a
 * second server on a second database, made and dropped the same way.
 *
 * `LINGUALAB_E2E=packaged` runs only the smoke test of the packaged student
 * app, which needs no server: CI's Windows job, after building the installer.
 */

const PACKAGED = process.env['LINGUALAB_E2E'] === 'packaged';

const JWT_SECRET = 'e2e-only-secret-at-least-32-characters';

/** Makes the run's database, migrates and seeds it, and starts the built server on it. */
function server(name: string, databaseUrl: string, port: number) {
  return {
    name,
    command:
      'node --experimental-strip-types e2e/src/support/create-database.ts && ' +
      'pnpm --filter @lingualab/server db:migrate && ' +
      'pnpm --filter @lingualab/server db:seed && ' +
      'pnpm --filter @lingualab/server start',
    cwd: '..',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: databaseUrl, PORT: String(port), JWT_SECRET },
  };
}

export default defineConfig({
  testDir: './src',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  ...(PACKAGED ? {} : { globalTeardown: './src/support/global-teardown.ts' }),
  forbidOnly: Boolean(process.env['CI']),
  use: {
    baseURL: `http://localhost:${PANEL_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: PACKAGED
    ? [{ name: 'packaged app', testMatch: 'stu-06.packaged.spec.ts' }]
    : [
        {
          name: 'admin',
          testMatch: 'admin-journey.spec.ts',
          use: { browserName: 'chromium' },
        },
        {
          // A new PC waits up to 30 s for its next check-in after approval.
          name: 'student app',
          testMatch: 'stu-06.kiosk.spec.ts',
          timeout: 120_000,
        },
      ],
  webServer: PACKAGED
    ? []
    : [
        server('server', RUN_DATABASE_URL, SERVER_PORT),
        {
          name: 'admin panel',
          command: `pnpm --filter @lingualab/admin preview --port ${PANEL_PORT}`,
          cwd: '..',
          url: `http://localhost:${PANEL_PORT}`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: { LINGUALAB_SERVER: `http://localhost:${SERVER_PORT}` },
        },
        server('kiosk server', KIOSK_DATABASE_URL, KIOSK_SERVER_PORT),
      ],
});
