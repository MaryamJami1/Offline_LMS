import pg from 'pg';

/**
 * Each end-to-end run gets a database of its own, made for it and dropped after
 * it, so the journey starts from the seed every time and never touches the
 * development or test databases. Only a name of this shape is ever dropped.
 */
export const RUN_DATABASE = /^lingualab_e2e_\d+_\d+(_kiosk)?$/;

/** The same server and account, on the database every PostgreSQL has. */
function maintenanceUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

export function databaseName(databaseUrl: string): string {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!RUN_DATABASE.test(name)) {
    throw new Error(`"${name}" is not an end-to-end run's own database; refusing to touch it.`);
  }
  return name;
}

async function run(databaseUrl: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: maintenanceUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function createRunDatabase(databaseUrl: string): Promise<void> {
  await run(databaseUrl, `CREATE DATABASE "${databaseName(databaseUrl)}"`);
}

export async function dropRunDatabase(databaseUrl: string): Promise<void> {
  await run(databaseUrl, `DROP DATABASE IF EXISTS "${databaseName(databaseUrl)}" WITH (FORCE)`);
}
