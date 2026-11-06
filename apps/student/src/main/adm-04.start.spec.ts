// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerError } from './server-api.js';
import { IDENTITY } from './test/fake-server.js';
import { approvedShell, shellUnderTest, SERVER_URL } from './test/shell-harness.js';

/**
 * ADM-04 and STU-01: a lab PC's first start registers it and waits for the
 * admin; every start after that checks in with the key, and the login screen
 * (S-01) shows which PC and seat this is (docs/docs/06-security-and-data.md,
 * Device trust; 07, Installing the student app).
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ADM-04 the first start of a lab PC', () => {
  it('registers, keeps the key it is given with its network card, and waits for the admin', async () => {
    const { shell, server, store } = shellUnderTest();

    await shell.start();

    expect(server.calls).toEqual(['register']);
    expect(store.stored).toEqual({ key: server.pc?.key, mac: IDENTITY.mac });
    expect(shell.state()).toEqual({ screen: 'waiting', hostname: 'LAB1-A1' });
  });

  it('asks again every 30 seconds, and shows the login once the admin has approved it', async () => {
    const { shell, server } = shellUnderTest();
    await shell.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.state().screen).toBe('waiting');

    server.approve({ seatCode: 'A1', labRoomName: 'Lab 1' });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(shell.state()).toEqual({
      screen: 'login',
      place: { hostname: 'LAB1-A1', seatCode: 'A1', labRoomName: 'Lab 1' },
    });
  });
});

describe('ADM-04 every start after that', () => {
  it('checks in with the stored key and asks where it is', async () => {
    const { shell, server } = approvedShell();

    await shell.start();

    expect(server.calls).toEqual(['register', 'deviceMe']);
    expect(shell.state()).toEqual({
      screen: 'login',
      place: { hostname: 'LAB1-A1', seatCode: 'A1', labRoomName: 'Lab 1' },
    });
  });

  it('says when the admin has not put the PC on a seat yet, and notices when they do', async () => {
    const { shell, server } = approvedShell();
    if (server.pc !== null) server.pc.seat = null;
    await shell.start();

    expect(shell.state()).toEqual({
      screen: 'login',
      place: { hostname: 'LAB1-A1', seatCode: null, labRoomName: null },
    });

    if (server.pc !== null) server.pc.seat = { seatCode: 'B2', labRoomName: 'Lab 1' };
    await vi.advanceTimersByTimeAsync(30_000);

    expect(shell.state()).toMatchObject({ place: { seatCode: 'B2' } });
  });

  it('registers again, for a new key, after the admin resets the PC', async () => {
    const { shell, server, store } = approvedShell();
    await shell.start();

    server.reset();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(shell.state()).toEqual({ screen: 'waiting', hostname: 'LAB1-A1' });
    expect(store.stored?.key).toBe(server.pc?.key);
    expect(store.stored?.key).not.toBe('the-key');
  });
});

describe('ADM-04 when the PC cannot join', () => {
  it('says the server cannot be reached, and tries again every 30 seconds', async () => {
    const { shell, server } = approvedShell();
    server.reachable = false;
    await shell.start();

    expect(shell.state()).toEqual({ screen: 'unreachable', serverUrl: SERVER_URL });

    server.reachable = true;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(shell.state().screen).toBe('login');
  });

  it('tells the admin what to do for an approved PC that has lost its key', async () => {
    const { shell, server } = shellUnderTest();
    server.registerRefusal = new ServerError(409, 'DEVICE_ALREADY_REGISTERED', 'approved');
    await shell.start();

    expect(shell.state()).toEqual({
      screen: 'refused',
      message:
        'This PC is approved but has lost its key. Ask the admin to press Reset for it in Lab and seats.',
    });

    server.registerRefusal = null;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.state().screen).toBe('waiting');
  });

  it('tells the admin when the PC has been retired, or too many PCs are waiting', async () => {
    const cases = [
      [
        new ServerError(409, 'DEVICE_RETIRED', 'retired'),
        'This PC has been retired. Ask the admin to press Reset for it in Lab and seats.',
      ],
      [
        new ServerError(429, 'TOO_MANY_WAITING', 'too many'),
        'Too many new PCs are waiting. Ask the admin to approve or remove some in Lab and seats.',
      ],
    ] as const;
    for (const [refusal, message] of cases) {
      const { shell, server } = shellUnderTest();
      server.registerRefusal = refusal;
      await shell.start();

      expect(shell.state()).toEqual({ screen: 'refused', message });
    }
  });

  it('tells every screen that is listening', async () => {
    const { shell, states } = shellUnderTest();

    await shell.start();

    expect(states.map((state) => state.screen)).toEqual(['starting', 'waiting']);
  });
});
