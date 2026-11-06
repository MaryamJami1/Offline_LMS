import { test, expect } from '@playwright/test';

/**
 * The admin's first morning, end to end, against the built server on a fresh,
 * seeded database and the built admin panel under the lab server's
 * Content-Security-Policy.
 *
 * Covers ADM-01 (log in, first password changed), ADM-02 (import students),
 * ADM-04 (approve a new PC and bind it to a seat), STU-06 (the seeded exit PIN
 * changed from the dashboard, and the approved PC closing its app with the new
 * one) and NFR-13 (the panel runs under the strict policy with no violation,
 * and a reload keeps the login).
 */

const SEED_PASSWORD = 'Lab-2026';
const NEW_PASSWORD = 'Journey-Pass-2026';
const SEEDED_EXIT_PIN = '135790';
const NEW_EXIT_PIN = '204816';
const PC = { hostname: 'LAB1-E2E', mac: '02:00:00:00:e2:e2' } as const;

const IMPORT_FILE = ['name,class,phone', 'Ayesha Noor,B-12,', 'Bilal Khan,B-99,', ''].join('\n');

test('the admin logs in, imports students, and approves a PC onto a seat', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content.Security.Policy/i.test(message.text())) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  // Log in with the seeded first password, and change it before anything else.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.getByLabel('Current password').fill(SEED_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('New password again').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();

  const navigation = page.getByRole('navigation');
  await expect(navigation.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The seeded exit PIN needs attention until the admin changes it.
  const attention = page.getByRole('region', { name: 'Needs attention' });
  const seededPin = 'The student app still has the first exit PIN';
  await attention.getByRole('button', { name: `Change: ${seededPin}` }).click();
  const pinDialog = page.getByRole('dialog', { name: 'Change the exit PIN' });
  await pinDialog.getByLabel('New PIN', { exact: true }).fill(NEW_EXIT_PIN);
  await pinDialog.getByLabel('New PIN again').fill(NEW_EXIT_PIN);
  await pinDialog.getByLabel('Your password').fill(NEW_PASSWORD);
  await pinDialog.getByRole('button', { name: 'Change PIN' }).click();
  await expect(page.getByText('The exit PIN has been changed.', { exact: true })).toBeVisible();
  await expect(attention.getByText(seededPin)).toHaveCount(0);

  // Import two students: one good row, one naming a class that does not exist.
  await navigation.getByRole('link', { name: 'Students' }).click();
  await page.getByRole('button', { name: 'Import from Excel' }).click();
  const importing = page.getByRole('dialog', { name: 'Import students' });
  await importing.getByLabel('Excel or CSV file').setInputFiles({
    name: 'students.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(IMPORT_FILE),
  });
  await importing.getByRole('button', { name: 'Import' }).click();

  await expect(importing.getByText('1 student created, 1 row refused.')).toBeVisible();
  const refused = importing.getByRole('table', { name: 'Rows refused' });
  await expect(refused.getByRole('cell', { name: '3', exact: true })).toBeVisible();
  await importing.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'Ayesha Noor', exact: true })).toBeVisible();

  // A new lab PC starts the student app and registers itself.
  const registered = await page.request.post('/api/devices/register', { data: PC });
  expect(registered.status()).toBe(201);
  const deviceKey = ((await registered.json()) as { deviceKey: string }).deviceKey;

  // The admin approves it onto seat A1 of Lab 1.
  await navigation.getByRole('link', { name: 'Lab and seats' }).click();
  const waiting = page.getByRole('region', { name: 'New PCs waiting' });
  await expect(waiting.getByText(PC.hostname, { exact: true })).toBeVisible();
  await waiting.getByLabel(`Seat for ${PC.hostname}`).selectOption('A1');
  await waiting.getByRole('button', { name: `Approve ${PC.hostname}` }).click();

  await expect(page.getByText(`${PC.hostname} approved on seat A1`, { exact: true })).toBeVisible();
  await expect(waiting.getByText('No new PCs are waiting.')).toBeVisible();
  const seat = page.getByRole('button', { name: `A1, PC ${PC.hostname}, empty seat` });
  await expect(seat).toBeVisible();

  // A reload keeps the admin logged in, on the same screen.
  await page.reload();
  await expect(
    page.getByRole('button', { name: `A1, PC ${PC.hostname}, empty seat` }),
  ).toBeVisible();

  // The approved PC closes its student app with the new PIN, not the seeded one.
  const exit = (pin: string) =>
    page.request.post('/api/devices/exit', {
      data: { pin },
      headers: { 'X-Device-Key': deviceKey },
    });
  expect((await exit(SEEDED_EXIT_PIN)).status()).toBe(403);
  expect((await exit(NEW_EXIT_PIN)).status()).toBe(204);

  expect(violations).toEqual([]);
});
