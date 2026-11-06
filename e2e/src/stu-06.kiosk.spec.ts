import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endApp, must, removeFolder } from './support/electron.ts';
import { KIOSK_SERVER_URL } from './support/run.ts';

/**
 * T-STU-06 (STU-06): the built student app, in kiosk mode, cannot be closed
 * without the admin PIN.
 *
 * It runs against a server and database of its own (playwright.config.ts), so
 * the seeded admin password and exit PIN are those of the seed whatever the
 * admin journey changes on its own. The PC registers as itself, waits, is
 * approved by the admin through the API, and then shows its seat. Closing the
 * window, quitting and the blocked shortcuts leave it running; a wrong PIN
 * leaves it running; the seeded PIN closes it.
 *
 * The keys go through Electron's own input path (`sendInputEvent`), as a
 * keyboard's do. Playwright's `page.keyboard` talks to the page directly and
 * never reaches the main process, where the kiosk decides what a key does.
 */

const SEED_PASSWORD = 'Lab-2026';
const ADMIN_PASSWORD = 'Kiosk-Admin-2026';
const SEEDED_EXIT_PIN = '135790';

// No trailing separator: on Windows a quoted `...\"` would swallow the quote.
const studentApp = fileURLToPath(new URL('../../apps/student', import.meta.url));
const electronPath = createRequire(join(studentApp, 'package.json'))('electron') as string;

type Modifier = 'control' | 'alt' | 'shift';

/** A key pressed on the keyboard, through the main process like a real one. */
async function press(app: ElectronApplication, keyCode: string, modifiers: Modifier[] = []) {
  await app.evaluate(
    ({ BrowserWindow }, key) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.sendInputEvent({ type: 'keyDown', keyCode: key.keyCode, modifiers: key.modifiers });
      contents?.sendInputEvent({ type: 'keyUp', keyCode: key.keyCode, modifiers: key.modifiers });
    },
    { keyCode, modifiers },
  );
}

async function stillOpen(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win !== undefined && !win.isDestroyed() && win.isVisible();
  });
}

/** The admin, on the kiosk test's own server, with the first password changed. */
async function adminToken(page: Page): Promise<string> {
  const login = await page.request.post(`${KIOSK_SERVER_URL}/api/auth/login`, {
    data: { username: 'admin', password: SEED_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const accessToken = ((await login.json()) as { accessToken: string }).accessToken;
  const changed = await page.request.post(`${KIOSK_SERVER_URL}/api/auth/change-password`, {
    data: { currentPassword: SEED_PASSWORD, newPassword: ADMIN_PASSWORD },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(changed.ok()).toBe(true);
  return accessToken;
}

/** Approves the PC waiting on the server onto seat A1 of Lab 1, as the admin does on A-04. */
async function approveWaitingPc(page: Page): Promise<string> {
  const headers = { Authorization: `Bearer ${await adminToken(page)}` };
  const waiting = await page.request.get(`${KIOSK_SERVER_URL}/api/devices?status=waiting`, {
    headers,
  });
  const pcs = ((await waiting.json()) as { items: { id: string; hostname: string }[] }).items;
  expect(pcs).toHaveLength(1);
  const pc = must(pcs[0], 'the waiting PC');

  const labs = await page.request.get(`${KIOSK_SERVER_URL}/api/labs`, { headers });
  const lab = must(((await labs.json()) as { items: { id: string }[] }).items[0], 'Lab 1');
  const seats = await page.request.get(`${KIOSK_SERVER_URL}/api/labs/${lab.id}/seats`, {
    headers,
  });
  const a1 = must(
    ((await seats.json()) as { seats: { id: string; code: string }[] }).seats.find(
      (seat) => seat.code === 'A1',
    ),
    'seat A1',
  );

  const approved = await page.request.patch(`${KIOSK_SERVER_URL}/api/devices/${pc.id}`, {
    data: { action: 'approve', seatId: a1.id },
    headers,
  });
  expect(approved.status()).toBe(200);
  return pc.hostname;
}

let app: ElectronApplication | undefined;
let closed = false;
let folder: string | undefined;

test.afterEach(async () => {
  await endApp(app, closed);
  removeFolder(folder);
});

test('the student app cannot be closed without the admin PIN', async ({ page }) => {
  folder = mkdtempSync(join(tmpdir(), 'lingualab-kiosk-'));
  const config = join(folder, 'lingualab.config.json');
  writeFileSync(config, JSON.stringify({ serverUrl: KIOSK_SERVER_URL }));

  app = await _electron.launch({
    executablePath: electronPath,
    args: ['.', `--user-data-dir=${join(folder, 'user-data')}`],
    cwd: studentApp,
    env: { ...process.env, LINGUALAB_KIOSK: '1', LINGUALAB_CONFIG: config },
  });
  app.once('close', () => {
    closed = true;
  });
  const window = await app.firstWindow();

  // A new PC registers itself and waits for the admin.
  await expect(window.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { kiosk: win?.isKiosk(), onTop: win?.isAlwaysOnTop(), closable: win?.isClosable() };
    }),
  ).toEqual({ kiosk: true, onTop: true, closable: false });

  // Approved onto A1, the PC shows its seat at the next check-in.
  const hostname = await approveWaitingPc(page);
  await expect(window.getByText(`This PC: ${hostname} · Seat A1`)).toBeVisible({
    timeout: 45_000,
  });

  // Closing the window and quitting the app leave it open.
  await app.evaluate(({ BrowserWindow, app: electronApp }) => {
    BrowserWindow.getAllWindows()[0]?.close();
    electronApp.quit();
  });
  await window.waitForTimeout(1_000);
  expect(await stillOpen(app)).toBe(true);

  // So do the shortcuts that close, reload or open the developer tools.
  await window.evaluate(() => {
    (window as unknown as { kioskMarker: boolean }).kioskMarker = true;
  });
  await press(app, 'W', ['control']);
  await press(app, 'R', ['control']);
  await press(app, 'F5');
  await press(app, 'I', ['control', 'shift']);
  await window.waitForTimeout(1_000);
  expect(await stillOpen(app)).toBe(true);
  expect(
    await window.evaluate(() => (window as unknown as { kioskMarker?: boolean }).kioskMarker),
  ).toBe(true);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened(),
    ),
  ).toBe(false);

  // The admin's shortcut asks for the PIN; a wrong one is refused.
  await press(app, 'Q', ['control', 'alt', 'shift']);
  const dialog = window.getByRole('dialog', { name: 'Close the student app' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Admin PIN').fill('000000');
  await dialog.getByRole('button', { name: 'Close app' }).click();
  await expect(dialog.getByText('Wrong PIN. 4 tries left.')).toBeVisible();
  expect(await stillOpen(app)).toBe(true);

  // The right PIN closes it.
  const exited = app.waitForEvent('close');
  await dialog.getByLabel('Admin PIN').fill(SEEDED_EXIT_PIN);
  await dialog.getByRole('button', { name: 'Close app' }).click();
  await exited;
  expect(closed).toBe(true);
});
