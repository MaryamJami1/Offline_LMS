import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/index.js';

const DEV_DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab';

/** The database tests own their own database, so exact row counts mean something. */
export const TEST_DATABASE_NAME = 'lingualab_test';

function withDatabase(name: string): string {
  const url = new URL(DEV_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

export const TEST_DATABASE_URL = withDatabase(TEST_DATABASE_NAME);

/** Connects to the server's maintenance database, which always exists. */
export const MAINTENANCE_DATABASE_URL = withDatabase('postgres');

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });
}

/**
 * Empties every table, leaving the schema and Prisma's migration history alone,
 * so each spec file starts from a known database.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;
  if (tables.length === 0) {
    return;
  }
  const list = tables.map((table) => `"public"."${table.table_name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** PostgreSQL unique violation, as Prisma reports it. */
export const UNIQUE_VIOLATION = 'P2002';

/** PostgreSQL foreign key violation, as Prisma reports it. */
export const FOREIGN_KEY_VIOLATION = 'P2003';

/**
 * Runs a write that must be refused and reports the Prisma error code, so a
 * spec can say which rule stopped it. Returns undefined when the write passed.
 */
export async function errorCode(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}
