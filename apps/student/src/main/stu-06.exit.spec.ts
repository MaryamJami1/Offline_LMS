// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { approvedShell, loggedInShell } from './test/shell-harness.js';

/**
 * STU-06 in the shell: the app closes only when the server says the admin PIN
 * is right. A student logged in at the time is logged out first, so their
 * seat is freed. The PIN is never checked on the PC.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('STU-06 closing the student app', () => {
  it('closes with the right PIN', async () => {
    const { shell, server, quit } = approvedShell();
    await shell.start();

    expect(await shell.exit('204816')).toEqual({ ok: true });
    expect(server.exits).toBe(1);
    expect(quit).toHaveBeenCalledOnce();
  });

  it('logs out whoever is logged in before it closes', async () => {
    const { shell, server, quit } = await loggedInShell();

    await shell.exit('204816');

    expect(server.logouts.map((logout) => logout.reason)).toEqual(['manual']);
    expect(quit).toHaveBeenCalledOnce();
  });

  it('stays open with a wrong PIN, and says how many tries are left', async () => {
    const { shell, quit } = approvedShell();
    await shell.start();

    expect(await shell.exit('000000')).toEqual({
      ok: false,
      problem: { field: 'pin', message: 'Wrong PIN. 4 tries left.' },
    });
    expect(quit).not.toHaveBeenCalled();
  });

  it('says one try, not one tries', async () => {
    const { shell, server } = approvedShell();
    server.exitTriesLeft = 2;
    await shell.start();

    expect(await shell.exit('000000')).toMatchObject({
      problem: { message: 'Wrong PIN. 1 try left.' },
    });
  });

  it('says until when the PC is locked out, in the institute’s time', async () => {
    const { shell, server } = approvedShell();
    server.exitTriesLeft = 1;
    await shell.start();

    expect(await shell.exit('000000')).toEqual({
      ok: false,
      problem: { field: 'pin', message: 'Too many wrong PINs. Try again after 09:15.' },
    });
  });

  it('asks for six digits before sending anything', async () => {
    const { shell, server } = approvedShell();
    await shell.start();

    expect(await shell.exit('1234')).toEqual({
      ok: false,
      problem: { field: 'pin', message: 'Type the six-digit PIN' },
    });
    expect(server.calls).not.toContain('exit');
  });

  it('stays open when the server cannot check the PIN, and says how to get out', async () => {
    const { shell, server, quit } = approvedShell();
    await shell.start();
    server.reachable = false;

    expect(await shell.exit('204816')).toEqual({
      ok: false,
      problem: {
        message:
          'The server cannot be reached, so the PIN cannot be checked. Use Ctrl+Alt+Del to switch to the admin Windows account.',
      },
    });
    expect(quit).not.toHaveBeenCalled();
  });
});
