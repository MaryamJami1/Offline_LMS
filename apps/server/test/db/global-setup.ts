import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { MAINTENANCE_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from './database.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** PostgreSQL: duplicate_database, raised when the test database is already there. */
const DUPLICATE_DATABASE = '42P04';

/** apps/server, where prisma/schema.prisma and prisma.config.ts live. */
const serverDir = fileURLToPath(new URL('../..', import.meta.url));

function prismaCli(): string {
  const packageJsonPath = require.resolve('prisma/package.json');
  const { bin } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin: Record<string, string>;
  };
  return join(dirname(packageJsonPath), bin['prisma'] as string);
}

async function createTestDatabase(): Promise<void> {
  const client = new Client({ connectionString: MAINTENANCE_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== DUPLICATE_DATABASE) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

/**
 * Database specs run against a real PostgreSQL in infra/docker-compose.yml, in
 * their own database, migrated the same way the lab server is: migrate deploy.
 */
export async function setup(): Promise<void> {
  await createTestDatabase();
  await execFileAsync(process.execPath, [prismaCli(), 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
