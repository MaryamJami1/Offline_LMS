// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createQuitGate, guardWindow, keyAction, windowOptions, type KeyInput } from './kiosk.js';

/**
 * STU-06: the student app runs full screen in kiosk mode and cannot be closed
 * without the admin PIN. Alt+F4, closing the window and quitting the app are
 * all refused until the server has said the PIN is right; Ctrl+Alt+Shift+Q
 * opens the PIN dialog. Windows shutting down or logging off is never blocked.
 * What Electron cannot block (Ctrl+Alt+Del, and the Windows key while
 * Windows itself is in front) is left to standard Windows accounts (06).
 */

function key(keyName: string, mods: Partial<Omit<KeyInput, 'key' | 'type'>> = {}): KeyInput {
  return {
    type: 'keyDown',
    key: keyName,
    control: false,
    alt: false,
    shift: false,
    meta: false,
    ...mods,
  };
}

describe('STU-06 the kiosk window', () => {
  it('fills the screen, stays on top, has no frame and keeps the page away from Node', () => {
    const options = windowOptions({ kiosk: true, preload: 'C:\\app\\preload.cjs' });

    expect(options).toMatchObject({
      kiosk: true,
      fullscreen: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      closable: false,
      minimizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: 'C:\\app\\preload.cjs',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: false,
        spellcheck: false,
      },
    });
  });

  it('is an ordinary window, with developer tools, in a development run', () => {
    const options = windowOptions({ kiosk: false, preload: 'p' });

    expect(options).toMatchObject({ kiosk: false, fullscreen: false, frame: true, closable: true });
    expect(options.webPreferences).toMatchObject({
      devTools: true,
      contextIsolation: true,
      sandbox: true,
    });
  });
});

describe('STU-06 the keys a student might try', () => {
  it('opens the PIN dialog on Ctrl+Alt+Shift+Q', () => {
    expect(keyAction(key('q', { control: true, alt: true, shift: true }), true)).toBe(
      'exit-dialog',
    );
    expect(keyAction(key('Q', { control: true, alt: true, shift: true }), false)).toBe(
      'exit-dialog',
    );
  });

  it('blocks closing, reloading, printing, full screen and the developer tools', () => {
    const blocked = [
      key('F4', { alt: true }),
      key('w', { control: true }),
      key('W', { control: true, shift: true }),
      key('q', { control: true }),
      key('r', { control: true }),
      key('R', { control: true, shift: true }),
      key('F5'),
      key('F11'),
      key('F12'),
      key('I', { control: true, shift: true }),
      key('J', { control: true, shift: true }),
      key('p', { control: true }),
      key('n', { control: true }),
      key('o', { control: true }),
      key('s', { control: true }),
      key('-', { control: true }),
      key('=', { control: true }),
      key('0', { control: true }),
    ];
    for (const input of blocked) {
      expect(keyAction(input, true), JSON.stringify(input)).toBe('block');
    }
  });

  it('lets typing, editing and moving between fields through', () => {
    for (const input of [
      key('a'),
      key('A', { shift: true }),
      key('Tab'),
      key('Enter'),
      key('Backspace'),
      key('c', { control: true }),
      key('v', { control: true }),
      key('x', { control: true }),
      key('z', { control: true }),
      key('a', { control: true }),
    ]) {
      expect(keyAction(input, true), JSON.stringify(input)).toBe('pass');
    }
  });

  it('lets a developer reload and open the tools outside kiosk mode', () => {
    expect(keyAction(key('F12'), false)).toBe('pass');
    expect(keyAction(key('r', { control: true }), false)).toBe('pass');
  });

  it('ignores the key coming back up', () => {
    expect(keyAction({ ...key('F4', { alt: true }), type: 'keyUp' }, true)).toBe('pass');
  });
});

class FakeWebContents extends EventEmitter {
  reload = vi.fn();
  openHandler: ((details: { url: string }) => { action: string }) | null = null;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }) {
    this.openHandler = handler;
  }
}

class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents();
}

function preventable() {
  return { preventDefault: vi.fn() };
}

function guarded(kiosk = true) {
  const win = new FakeWindow();
  const gate = createQuitGate();
  const onExitRequested = vi.fn();
  guardWindow(win, { kiosk, gate, onExitRequested });
  return { win, gate, onExitRequested };
}

describe('STU-06 guarding the window', () => {
  it('refuses to close until the PIN has been accepted', () => {
    const { win, gate } = guarded();

    const first = preventable();
    win.emit('close', first);
    expect(first.preventDefault).toHaveBeenCalled();

    gate.allow();
    const second = preventable();
    win.emit('close', second);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('closes freely outside kiosk mode', () => {
    const { win } = guarded(false);
    const event = preventable();

    win.emit('close', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('stops blocked keys, and asks for the PIN on the shortcut', () => {
    const { win, onExitRequested } = guarded();

    const altF4 = preventable();
    win.webContents.emit('before-input-event', altF4, key('F4', { alt: true }));
    const shortcut = preventable();
    win.webContents.emit(
      'before-input-event',
      shortcut,
      key('q', { control: true, alt: true, shift: true }),
    );
    const typing = preventable();
    win.webContents.emit('before-input-event', typing, key('a'));

    expect(altF4.preventDefault).toHaveBeenCalled();
    expect(shortcut.preventDefault).toHaveBeenCalled();
    expect(onExitRequested).toHaveBeenCalledOnce();
    expect(typing.preventDefault).not.toHaveBeenCalled();
  });

  it('opens no other window and goes to no other page', () => {
    const { win } = guarded();

    expect(win.webContents.openHandler?.({ url: 'https://example.com' })).toEqual({
      action: 'deny',
    });
    const navigate = preventable();
    win.webContents.emit('will-navigate', navigate, 'https://example.com');
    expect(navigate.preventDefault).toHaveBeenCalled();
  });

  it('reloads the screens if they crash, rather than leaving a blank kiosk', () => {
    const { win } = guarded();

    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });

    expect(win.webContents.reload).toHaveBeenCalled();
  });

  it('lets Windows shut down or log off, which must never be blocked', () => {
    const { win, gate } = guarded();

    win.emit('session-end');
    const close = preventable();
    win.emit('close', close);

    expect(gate.allowed()).toBe(true);
    expect(close.preventDefault).not.toHaveBeenCalled();
  });
});

describe('STU-06 quitting the app', () => {
  it('is refused until the PIN has been accepted', () => {
    const app = new EventEmitter();
    const gate = createQuitGate();
    gate.guardApp(app, true);

    const before = preventable();
    app.emit('before-quit', before);
    expect(before.preventDefault).toHaveBeenCalled();

    gate.allow();
    const after = preventable();
    app.emit('before-quit', after);
    expect(after.preventDefault).not.toHaveBeenCalled();
  });

  it('is free outside kiosk mode', () => {
    const app = new EventEmitter();
    const gate = createQuitGate();
    gate.guardApp(app, false);

    const event = preventable();
    app.emit('before-quit', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
