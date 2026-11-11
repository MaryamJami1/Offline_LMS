import { dropRunDatabase } from './database.ts';
import { KIOSK_DATABASE_URL, RUN_DATABASE_URL } from './run.ts';

export default async function globalTeardown(): Promise<void> {
  await dropRunDatabase(RUN_DATABASE_URL);
  await dropRunDatabase(KIOSK_DATABASE_URL);
}
