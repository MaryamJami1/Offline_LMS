/**
 * This run's databases. playwright.config.ts is loaded by the runner and again
 * by each worker, so the name is fixed once in the environment, which the
 * workers inherit, and read back from there.
 *
 * The admin journey and the kiosk test (T-STU-06) each get a server and a
 * database of their own, so neither depends on what the other changes or on
 * the order they run in.
 */
const base = new URL(
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab',
);
process.env['LINGUALAB_E2E_DATABASE'] ??= `lingualab_e2e_${process.pid}_${Date.now()}`;

function database(name: string): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

export const RUN_DATABASE_URL = database(process.env['LINGUALAB_E2E_DATABASE']);
export const KIOSK_DATABASE_URL = database(`${process.env['LINGUALAB_E2E_DATABASE']}_kiosk`);

export const SERVER_PORT = 3100;
export const PANEL_PORT = 4174;
export const KIOSK_SERVER_PORT = 3101;
export const KIOSK_SERVER_URL = `http://localhost:${KIOSK_SERVER_PORT}`;
