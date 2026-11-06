import { rmSync } from 'node:fs';
import type { ElectronApplication } from '@playwright/test';

/**
 * Ends the student app whatever state a test left it in. `app.exit()` skips
 * the kiosk's quit gate; waiting for Playwright's `close` means Electron's
 * helper processes are gone too, so its profile folder can be removed.
 */
export async function endApp(app: ElectronApplication | undefined, closed: boolean): Promise<void> {
  if (app === undefined || closed) return;
  const gone = app.waitForEvent('close').catch(() => undefined);
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined);
  await gone;
}

/** Windows keeps a profile's files locked for a moment after Electron exits. */
export function removeFolder(folder: string | undefined): void {
  if (folder !== undefined) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
  }
}

/** A value the test needs to go on, or a failure that says what was missing. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Expected ${what}, found none`);
  return value;
}
