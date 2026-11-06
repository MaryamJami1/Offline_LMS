// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loggedInShell } from './test/shell-harness.js';

/**
 * T-STU-07: a student is logged out after 30 idle minutes (fake timers).
 * Idle means no key press or mouse move anywhere on the PC, as Windows counts
 * it (Electron's powerMonitor.getSystemIdleTime), checked every 30 seconds.
 * The logout is recorded as `idle`. Teacher takeovers pause the watch (STU-03,
 * Phase 2), since a student watching a broadcast touches nothing.
 */

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Moves time on and the PC's idle time with it, as if nobody touched anything. */
async function idleFor(world: Awaited<ReturnType<typeof loggedInShell>>, minutes: number) {
  for (let second = 0; second < minutes * 60; second += 30) {
    world.setIdle(second + 30);
    await vi.advanceTimersByTimeAsync(30_000);
  }
}

describe('T-STU-07 idle logout', () => {
  it('logs the student out after 30 minutes with no input, as an idle logout', async () => {
    const world = await loggedInShell();

    await idleFor(world, 30);

    expect(world.server.logouts).toEqual([
      { refreshToken: expect.stringMatching(/^refresh-/) as unknown as string, reason: 'idle' },
    ]);
    expect(world.shell.state()).toEqual({
      screen: 'login',
      place: { hostname: 'LAB1-A1', seatCode: 'A1', labRoomName: 'Lab 1' },
      notice: 'You were logged out after 30 minutes without use.',
    });
  });

  it('leaves the student logged in at 29 minutes and 30 seconds', async () => {
    const world = await loggedInShell();

    world.setIdle(29 * 60 + 30);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    expect(world.server.logouts).toEqual([]);
    expect(world.shell.state().screen).toBe('home');
  });

  it('starts counting again whenever the student touches the keyboard or mouse', async () => {
    const world = await loggedInShell();

    await idleFor(world, 20);
    world.setIdle(0);
    await vi.advanceTimersByTimeAsync(30_000);
    await idleFor(world, 20);

    expect(world.server.logouts).toEqual([]);
  });

  it('does not log anybody out while paused for a teacher takeover', async () => {
    const world = await loggedInShell();

    world.shell.idle.pause();
    await idleFor(world, 45);

    expect(world.server.logouts).toEqual([]);
  });

  it('counts the 30 minutes from the end of the takeover, not from the last input', async () => {
    const world = await loggedInShell();
    world.shell.idle.pause();
    await idleFor(world, 45);

    world.shell.idle.resume();
    // Windows still counts every idle minute of the broadcast.
    world.setIdle(45 * 60 + 29 * 60 + 30);
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    expect(world.server.logouts).toEqual([]);

    world.setIdle(45 * 60 + 30 * 60);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(world.server.logouts.map((logout) => logout.reason)).toEqual(['idle']);
  });

  it('is not watching when nobody is logged in', async () => {
    const world = await loggedInShell();
    await world.shell.logout();

    await idleFor(world, 60);

    expect(world.server.logouts.map((logout) => logout.reason)).toEqual(['manual']);
  });
});
