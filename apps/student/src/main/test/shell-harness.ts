import { vi } from 'vitest';
import type { ShellState } from '../../bridge.js';
import type { StoredDeviceKey } from '../device-key-store.js';
import { createStudentShell } from '../student-shell.js';
import { FakeServer, IDENTITY, memoryKeyStore } from './fake-server.js';

export const SERVER_URL = 'https://192.168.10.2';

/**
 * The shell against the fake server, with the system idle time set by hand.
 * Use fake timers: the shell asks again every 30 seconds and watches idle time.
 */
export function shellUnderTest(options: { stored?: StoredDeviceKey | null } = {}) {
  let server: FakeServer | undefined;
  let idleSeconds = 0;
  const store = memoryKeyStore(options.stored ?? null);
  const quit = vi.fn();
  const shell = createStudentShell({
    serverUrl: SERVER_URL,
    createApi: (deviceKey) => {
      server = new FakeServer(deviceKey);
      return server;
    },
    store,
    identity: IDENTITY,
    idleSeconds: () => idleSeconds,
    quit,
  });
  const states: ShellState[] = [];
  shell.onState((state) => states.push(state));
  if (server === undefined) {
    throw new Error('the shell made no API');
  }
  return {
    shell,
    server,
    store,
    quit,
    states,
    /** Seconds since the last key press or mouse move anywhere on the PC. */
    setIdle(seconds: number) {
      idleSeconds = seconds;
    },
  };
}

/** A PC the admin has approved onto seat A1 of Lab 1, with its key stored. */
export function approvedShell() {
  const world = shellUnderTest({ stored: { key: 'the-key', mac: IDENTITY.mac } });
  world.server.pc = {
    key: 'the-key',
    approved: true,
    seat: { seatCode: 'A1', labRoomName: 'Lab 1' },
  };
  return world;
}

/** An approved PC with S-1001 logged in. */
export async function loggedInShell() {
  const world = approvedShell();
  await world.shell.start();
  const result = await world.shell.login('S-1001', 'Lab-pass-2026');
  if (!result.ok) {
    throw new Error(`could not log in: ${result.problem.message}`);
  }
  return world;
}
