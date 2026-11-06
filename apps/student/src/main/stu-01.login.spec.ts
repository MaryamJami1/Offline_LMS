// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { approvedShell, loggedInShell } from './test/shell-harness.js';

/**
 * STU-01 at the PC: a student logs in at any approved, seated PC, with the
 * PC's key sent along; a first-login account changes its password before
 * anything else; a manual logout frees the seat. The shell keeps the login
 * alive while the app runs, and when the server ends it (another PC, the
 * admin, or End class with LAB-03) the app goes back to the login.
 */

const PLACE = { hostname: 'LAB1-A1', seatCode: 'A1', labRoomName: 'Lab 1' };
const AYESHA = { username: 'S-1001', fullName: 'Ayesha Khan' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T04:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('STU-01 logging in at the PC', () => {
  it('shows the student their work once the password is right', async () => {
    const { shell } = approvedShell();
    await shell.start();

    expect(await shell.login('S-1001', 'Lab-pass-2026')).toEqual({ ok: true });
    expect(shell.state()).toEqual({ screen: 'home', place: PLACE, student: AYESHA });
  });

  it('takes the student ID in any case and with spaces around it', async () => {
    const { shell } = approvedShell();
    await shell.start();

    expect(await shell.login('  s-1001 ', 'Lab-pass-2026')).toEqual({ ok: true });
  });

  it('says so under the password when it is wrong', async () => {
    const { shell } = approvedShell();
    await shell.start();

    expect(await shell.login('S-1001', 'not-it')).toEqual({
      ok: false,
      problem: { field: 'password', message: 'Wrong student ID or password' },
    });
    expect(shell.state().screen).toBe('login');
  });

  it('asks for both before sending anything', async () => {
    const { shell, server } = approvedShell();
    await shell.start();

    expect(await shell.login('', 'x')).toEqual({
      ok: false,
      problem: { field: 'username', message: 'Type your student ID' },
    });
    expect(await shell.login('S-1001', '')).toEqual({
      ok: false,
      problem: { field: 'password', message: 'Type your password' },
    });
    expect(server.calls).not.toContain('login');
  });

  it('says why when the PC has no seat yet', async () => {
    const { shell, server } = approvedShell();
    if (server.pc !== null) server.pc.seat = null;
    await shell.start();

    expect(await shell.login('S-1001', 'Lab-pass-2026')).toEqual({
      ok: false,
      problem: { message: 'This PC is not on a seat yet. Ask the admin.' },
    });
  });

  it('says when the server cannot be reached', async () => {
    const { shell, server } = approvedShell();
    await shell.start();
    server.reachable = false;

    expect(await shell.login('S-1001', 'Lab-pass-2026')).toEqual({
      ok: false,
      problem: { message: 'The server cannot be reached. Check the network cable and try again.' },
    });
  });

  it('turns a staff account away, since staff do not use the student app', async () => {
    const { shell, server } = approvedShell();
    server.accounts.push({
      username: 'sara.iqbal',
      password: 'Teacher-pass-2026',
      fullName: 'Sara Iqbal',
      role: 'teacher',
      mustChangePassword: false,
    });
    await shell.start();

    expect(await shell.login('sara.iqbal', 'Teacher-pass-2026')).toEqual({
      ok: false,
      problem: { message: 'This app is for students. Teachers use the teacher console.' },
    });
    expect(server.live.size).toBe(0);
    expect(shell.state().screen).toBe('login');
  });
});

describe('STU-01 the first login', () => {
  it('asks for a new password before anything else, and keeps the seat', async () => {
    const { shell, server } = approvedShell();
    const account = server.accounts[0];
    if (account !== undefined) account.mustChangePassword = true;
    await shell.start();

    await shell.login('S-1001', 'Lab-pass-2026');
    expect(shell.state()).toEqual({ screen: 'change-password', place: PLACE, student: AYESHA });

    expect(await shell.changePassword('Lab-pass-2026', 'Karachi-2026')).toEqual({ ok: true });
    expect(shell.state()).toEqual({ screen: 'home', place: PLACE, student: AYESHA });
  });

  it('asks for at least eight characters, and the right current password', async () => {
    const { shell, server } = approvedShell();
    const account = server.accounts[0];
    if (account !== undefined) account.mustChangePassword = true;
    await shell.start();
    await shell.login('S-1001', 'Lab-pass-2026');

    expect(await shell.changePassword('Lab-pass-2026', 'short')).toEqual({
      ok: false,
      problem: { field: 'newPassword', message: 'Use at least 8 characters' },
    });
    expect(await shell.changePassword('not-it', 'Karachi-2026')).toEqual({
      ok: false,
      problem: { field: 'currentPassword', message: 'That is not your current password' },
    });
  });
});

describe('STU-07 logging out by hand', () => {
  it('ends the login on the server, as a manual logout, and shows the login again', async () => {
    const { shell, server } = await loggedInShell();

    await shell.logout();

    expect(server.logouts).toEqual([{ refreshToken: 'refresh-1', reason: 'manual' }]);
    expect(server.live.size).toBe(0);
    expect(shell.state()).toEqual({ screen: 'login', place: PLACE });
  });

  it('still shows the login when the server cannot be reached', async () => {
    const { shell, server } = await loggedInShell();
    server.reachable = false;

    await shell.logout();

    expect(shell.state().screen).toBe('login');
  });
});

describe('STU-01 staying logged in', () => {
  it('renews the login every ten minutes, before the access token runs out', async () => {
    const { server } = await loggedInShell();

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(server.calls.filter((call) => call === 'refresh')).toHaveLength(1);
    expect(server.live).toEqual(new Set(['refresh-2']));
  });

  it('goes back to the login, with a word why, when the server has ended it', async () => {
    const { shell, server } = await loggedInShell();
    server.live.clear();

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(shell.state()).toEqual({
      screen: 'login',
      place: PLACE,
      notice: 'You have been logged out. Log in again to carry on.',
    });
  });

  it('ends at once, without asking the server, when the server says so (End class with LAB-03)', async () => {
    const { shell, server } = await loggedInShell();

    shell.endedByServer('class_end');

    expect(shell.state()).toEqual({
      screen: 'login',
      place: PLACE,
      notice: 'The class has ended. You have been logged out.',
    });
    expect(server.logouts).toEqual([]);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.calls).not.toContain('refresh');
  });
});
