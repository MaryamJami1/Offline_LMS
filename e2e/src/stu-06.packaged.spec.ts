import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endApp, removeFolder } from './support/electron.ts';

/**
 * STU-06, the installed app: a smoke test of the packaged student app that
 * the installer ships (`pnpm --filter @lingualab/student installer`), run by
 * CI's Windows job (08). It needs no server.
 *
 * A packaged app is always a kiosk and reads its config only from beside the
 * exe: the development variables that say otherwise are ignored, so a student
 * cannot set them to leave kiosk mode or send the app to a server of their own.
 */

const exeDir = fileURLToPath(new URL('../../apps/student/release/win-unpacked', import.meta.url));
const exe = join(exeDir, 'LinguaLab Student.exe');
/** Nothing listens here, so the app says it cannot reach the server. */
const NO_SERVER = 'http://127.0.0.1:9';

let app: ElectronApplication | undefined;
let closed = false;
let folder: string | undefined;
const besideExe = join(exeDir, 'lingualab.config.json');

test.afterEach(async () => {
  await endApp(app, closed);
  rmSync(besideExe, { force: true });
  removeFolder(folder);
});

test('the packaged app is a kiosk and reads its config from beside the exe', async () => {
  folder = mkdtempSync(join(tmpdir(), 'lingualab-packaged-'));
  writeFileSync(besideExe, JSON.stringify({ serverUrl: NO_SERVER }));
  const elsewhere = join(folder, 'elsewhere.json');
  writeFileSync(elsewhere, JSON.stringify({ serverUrl: 'http://localhost:3000' }));

  app = await _electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${join(folder, 'user-data')}`],
    env: { ...process.env, LINGUALAB_KIOSK: '0', LINGUALAB_CONFIG: elsewhere },
  });
  app.once('close', () => {
    closed = true;
  });
  const window = await app.firstWindow();

  await expect(window.getByRole('heading', { name: 'The server cannot be reached' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(window.getByText(NO_SERVER)).toBeVisible();
  expect(
    await app.evaluate(({ app: electronApp, BrowserWindow }) => ({
      packaged: electronApp.isPackaged,
      kiosk: BrowserWindow.getAllWindows()[0]?.isKiosk(),
      onTop: BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop(),
      closable: BrowserWindow.getAllWindows()[0]?.isClosable(),
    })),
  ).toEqual({ packaged: true, kiosk: true, onTop: true, closable: false });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await window.waitForTimeout(1_000);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});
