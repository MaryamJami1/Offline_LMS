/**
 * This run's database. playwright.config.ts is loaded by the runner and again
 * by each worker, so the name is fixed once in the environment, which the
 * workers inherit, and read back from there.
 */
const base = new URL(
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab',
);
process.env['LINGUALAB_E2E_DATABASE'] ??= `lingualab_e2e_${process.pid}_${Date.now()}`;
base.pathname = `/${process.env['LINGUALAB_E2E_DATABASE']}`;

export const RUN_DATABASE_URL = base.toString();
