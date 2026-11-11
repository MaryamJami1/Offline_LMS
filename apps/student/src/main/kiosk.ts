import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Kiosk mode for the student app (STU-06; docs/docs/06-security-and-data.md,
 * Student app lock-down). Electron is kept out of this file, apart from its
 * types, so every rule here can be tested without starting Electron.
 */

/** The window: full screen and on top in kiosk mode, and never able to reach Node. */
export function windowOptions(options: {
  kiosk: boolean;
  preload: string;
}): BrowserWindowConstructorOptions {
  const { kiosk } = options;
  return {
    kiosk,
    fullscreen: kiosk,
    frame: !kiosk,
    alwaysOnTop: kiosk,
    skipTaskbar: kiosk,
    closable: !kiosk,
    minimizable: !kiosk,
    autoHideMenuBar: true,
    width: 1280,
    height: 800,
    backgroundColor: '#F5F7FA',
    show: false,
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !kiosk,
      spellcheck: false,
    },
  };
}

/** The parts of Electron's `Input` that decide what a key does. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type KeyAction = 'exit-dialog' | 'block' | 'pass';

/** With Ctrl: close, quit, reload, print, new window, open, save, zoom. */
const CONTROL_BLOCKED = new Set(['w', 'q', 'r', 'p', 'n', 'o', 's', 't', '-', '=', '+', '0']);

/** With Ctrl+Shift: the developer tools. */
const CONTROL_SHIFT_BLOCKED = new Set(['i', 'j', 'c']);

/** Reload, full screen, developer tools, help. */
const FUNCTION_BLOCKED = new Set(['F1', 'F5', 'F11', 'F12']);

/** What a key press does in the window, before the page sees it. */
export function keyAction(input: KeyInput, kiosk: boolean): KeyAction {
  if (input.type !== 'keyDown') {
    return 'pass';
  }
  const name = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const control = input.control || input.meta;
  // Ctrl+Alt+Shift+Q: the admin's way out, documented only in the admin guide (10).
  if (control && input.alt && input.shift && name === 'q') {
    return 'exit-dialog';
  }
  if (!kiosk) {
    return 'pass';
  }
  if (input.alt && name === 'F4') {
    return 'block';
  }
  if (FUNCTION_BLOCKED.has(name)) {
    return 'block';
  }
  if (control && input.shift && CONTROL_SHIFT_BLOCKED.has(name)) {
    return 'block';
  }
  if (control && CONTROL_BLOCKED.has(name)) {
    return 'block';
  }
  return 'pass';
}

interface Preventable {
  preventDefault(): void;
}

/** What is used of Electron's BrowserWindow and its webContents. */
export interface GuardedWindow {
  on(event: 'close', listener: (event: Preventable) => void): unknown;
  setClosable(closable: boolean): void;
  on(event: 'session-end', listener: () => void): unknown;
  webContents: {
    on(
      event: 'before-input-event',
      listener: (event: Preventable, input: KeyInput) => void,
    ): unknown;
    on(event: 'will-navigate', listener: (event: Preventable) => void): unknown;
    on(event: 'render-process-gone', listener: () => void): unknown;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
    reload(): void;
  };
}

/** What is used of Electron's `app`. */
export interface GuardedApp {
  on(event: 'before-quit', listener: (event: Preventable) => void): unknown;
}

/** Whether the app may close: only once the server has accepted the PIN, or Windows is ending. */
export interface QuitGate {
  allow(): void;
  allowed(): boolean;
  /** Runs when the gate opens, or at once if it is open already. */
  onAllow(listener: () => void): void;
  guardApp(app: GuardedApp, kiosk: boolean): void;
}

export function createQuitGate(): QuitGate {
  let open = false;
  const listeners: (() => void)[] = [];
  return {
    allow() {
      if (open) return;
      open = true;
      for (const listener of listeners) listener();
    },
    allowed: () => open,
    onAllow(listener) {
      if (open) listener();
      else listeners.push(listener);
    },
    guardApp(app, kiosk) {
      app.on('before-quit', (event) => {
        if (kiosk && !open) {
          event.preventDefault();
        }
      });
    },
  };
}

export function guardWindow(
  win: GuardedWindow,
  options: { kiosk: boolean; gate: QuitGate; onExitRequested: () => void },
): void {
  const { kiosk, gate } = options;

  win.on('close', (event) => {
    if (kiosk && !gate.allowed()) {
      event.preventDefault();
    }
  });
  // Shutting down or logging off Windows must never be held up by the app.
  win.on('session-end', () => gate.allow());
  // Windows ignores close() on a window made with `closable: false`, so
  // quitting after the right PIN would be cancelled without this.
  gate.onAllow(() => win.setClosable(true));

  win.webContents.on('before-input-event', (event, input) => {
    const action = keyAction(input, kiosk);
    if (action === 'pass') {
      return;
    }
    event.preventDefault();
    if (action === 'exit-dialog') {
      options.onExitRequested();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', () => win.webContents.reload());
}
