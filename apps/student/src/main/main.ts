import {
  BrowserWindow,
  Menu,
  app,
  ipcMain,
  net,
  powerMonitor,
  safeStorage,
  session,
} from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces, release, version } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DEFAULT_BRANDING } from '@lingualab/shared';
import { IPC, type ShellState } from '../bridge.js';
import { ConfigError, configPath, parseConfig, runOptions } from './config.js';
import { createDeviceKeyStore, type KeyFile } from './device-key-store.js';
import { createQuitGate, guardWindow, windowOptions } from './kiosk.js';
import { pcIdentity } from './pc-identity.js';
import { createServerApi } from './server-api.js';
import { createStudentShell, type StudentShell } from './student-shell.js';

/**
 * Electron's side of the student app: the window, the IPC handlers and the
 * real Windows services behind the shell. The logic lives in the modules it
 * wires together, which are tested on their own; this file is exercised end
 * to end by T-STU-06 (08).
 */

const here = dirname(fileURLToPath(import.meta.url));
const run = runOptions({ packaged: app.isPackaged, env: process.env });
const gate = createQuitGate();

if (!app.requestSingleInstanceLock()) {
  // Another copy is running already: this one leaves at once.
  app.exit(0);
}
gate.guardApp(app, run.kiosk);
// Shutting down Windows must never be held up by the app.
powerMonitor.on('shutdown', () => gate.allow());

function keyFile(path: string): KeyFile {
  return {
    read() {
      try {
        return readFileSync(path);
      } catch {
        return null;
      }
    },
    write: (data) => writeFileSync(path, data),
    remove: () => rmSync(path, { force: true }),
  };
}

/** Strings from the page are checked like any other input. */
const text = z.string().max(200);

function createShell(serverUrl: string): StudentShell {
  return createStudentShell({
    serverUrl,
    createApi: (deviceKey) =>
      createServerApi({ serverUrl, fetch: (url, init) => net.fetch(url, init), deviceKey }),
    store: createDeviceKeyStore(
      keyFile(join(app.getPath('userData'), 'device-key.bin')),
      safeStorage,
    ),
    identity: pcIdentity({
      hostname: hostname(),
      interfaces: networkInterfaces(),
      osVersion: `${version()} ${release()}`,
      appVersion: app.getVersion(),
    }),
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    quit: () => {
      gate.allow();
      app.quit();
    },
  });
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  // Nothing is granted to the page; the microphone comes with MOD-01.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, answer) =>
    answer(false),
  );

  const win = new BrowserWindow(
    windowOptions({ kiosk: run.kiosk, preload: join(here, '..', 'preload', 'preload.cjs') }),
  );
  if (run.kiosk) {
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  guardWindow(win, {
    kiosk: run.kiosk,
    gate,
    onExitRequested: () => win.webContents.send(IPC.exitRequested),
  });
  win.once('ready-to-show', () => win.show());
  app.on('second-instance', () => win.focus());

  let shell: StudentShell | null = null;
  let fixedState: ShellState | null = null;
  try {
    const config = parseConfig(
      readFileSync(
        configPath({
          packaged: app.isPackaged,
          exeDir: dirname(app.getPath('exe')),
          env: process.env,
        }),
        'utf8',
      ),
    );
    shell = createShell(config.serverUrl);
    shell.onState((state) => win.webContents.send(IPC.state, state));
  } catch (error) {
    fixedState = {
      screen: 'refused',
      message:
        error instanceof ConfigError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'The student app could not start.',
    };
  }

  /** Only the app's own window may call in. */
  function handle(channel: string, listener: (...args: unknown[]) => unknown): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (event.sender !== win.webContents) {
        throw new Error('Refused: not the student app window');
      }
      return listener(...args);
    });
  }

  const notStarted = { ok: false, problem: { message: 'The student app could not start.' } };
  handle(IPC.getState, () => fixedState ?? shell?.state());
  handle(IPC.branding, () => shell?.branding() ?? DEFAULT_BRANDING);
  handle(
    IPC.login,
    (username, password) => shell?.login(text.parse(username), text.parse(password)) ?? notStarted,
  );
  handle(
    IPC.changePassword,
    (current, next) => shell?.changePassword(text.parse(current), text.parse(next)) ?? notStarted,
  );
  handle(IPC.logout, () => shell?.logout());
  handle(IPC.exit, (pin) => shell?.exit(text.parse(pin)) ?? notStarted);

  await (run.rendererUrl === null
    ? win.loadFile(join(here, '..', 'renderer', 'index.html'))
    : win.loadURL(run.rendererUrl));
  await shell?.start();
}

app.on('window-all-closed', () => {
  if (!run.kiosk) {
    app.quit();
  }
});

void app.whenReady().then(start);
