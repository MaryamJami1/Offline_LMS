import { dropRunDatabase } from './database.ts';
import { RUN_DATABASE_URL } from './run.ts';

export default async function globalTeardown(): Promise<void> {
  await dropRunDatabase(RUN_DATABASE_URL);
}
