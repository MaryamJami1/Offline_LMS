import { defineConfig } from '@playwright/test';
import { RUN_DATABASE_URL } from './src/support/run.ts';

/**
 * The journey runs the built server on a database of its own, made, migrated
 * and seeded for each run and dropped after it (src/support/database.ts), beside the PostgreSQL and LiveKit of
 * infra/docker-compose.yml. The built admin panel is served by `vite preview`,
 * which sends the Content-Security-Policy of infra/Caddyfile. Going through
 * Caddy over HTTPS comes when the server joins docker-compose (09, Phase 2).
 */

const SERVER_PORT = 3100;
const PANEL_PORT = 4174;

export default defineConfig({
  testDir: './src',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalTeardown: './src/support/global-teardown.ts',
  forbidOnly: Boolean(process.env['CI']),
  use: {
    baseURL: `http://localhost:${PANEL_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'admin',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      name: 'server',
      command:
        'node --experimental-strip-types e2e/src/support/create-database.ts && ' +
        'pnpm --filter @lingualab/server db:migrate && ' +
        'pnpm --filter @lingualab/server db:seed && ' +
        'pnpm --filter @lingualab/server start',
      cwd: '..',
      url: `http://localhost:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: RUN_DATABASE_URL,
        PORT: String(SERVER_PORT),
        JWT_SECRET: 'e2e-only-secret-at-least-32-characters',
      },
    },
    {
      name: 'admin panel',
      command: `pnpm --filter @lingualab/admin preview --port ${PANEL_PORT}`,
      cwd: '..',
      url: `http://localhost:${PANEL_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LINGUALAB_SERVER: `http://localhost:${SERVER_PORT}` },
    },
  ],
});
