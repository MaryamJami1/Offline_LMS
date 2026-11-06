import { createRunDatabase } from './database.ts';

// Run by the server's webServer command in playwright.config.ts, before the
// migrations and the seed.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
await createRunDatabase(databaseUrl);
