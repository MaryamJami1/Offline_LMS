import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'https://localhost',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'admin',
      use: { browserName: 'chromium' },
    },
  ],
});
