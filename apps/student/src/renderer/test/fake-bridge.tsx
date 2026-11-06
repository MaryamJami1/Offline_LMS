import { vi } from 'vitest';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_BRANDING, type Branding } from '@lingualab/shared';
import type { ActionResult, PcPlace, ShellState, StudentBridge } from '../../bridge.js';
import { StudentApp } from '../app.js';

export const PLACE: PcPlace = { hostname: 'LAB1-D3', seatCode: 'D3', labRoomName: 'Lab 1' };
export const AYESHA = { username: 'S-1001', fullName: 'Ayesha Khan' };

/**
 * The main process, as the screens see it through `window.lingualab`. Tests
 * set what each call answers and move the app to another screen with `show`.
 */
export function createFakeBridge(initial: ShellState, branding: Branding = DEFAULT_BRANDING) {
  let state = initial;
  const stateListeners = new Set<(state: ShellState) => void>();
  const exitListeners = new Set<() => void>();

  const bridge = {
    getState: vi.fn(async () => state),
    onState: vi.fn((listener: (state: ShellState) => void) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    }),
    onExitRequested: vi.fn((listener: () => void) => {
      exitListeners.add(listener);
      return () => exitListeners.delete(listener);
    }),
    branding: vi.fn(async () => branding),
    login: vi.fn(async (_username: string, _password: string): Promise<ActionResult> => ({
      ok: true,
    })),
    changePassword: vi.fn(async (_current: string, _next: string): Promise<ActionResult> => ({
      ok: true,
    })),
    logout: vi.fn(async () => undefined),
    exit: vi.fn(async (_pin: string): Promise<ActionResult> => ({ ok: true })),
  } satisfies StudentBridge;

  return {
    bridge,
    /** The main process moves the app to another screen. */
    show(next: ShellState) {
      state = next;
      act(() => {
        for (const listener of stateListeners) listener(next);
      });
    },
    /** The admin pressed Ctrl+Alt+Shift+Q. */
    requestExit() {
      act(() => {
        for (const listener of exitListeners) listener();
      });
    },
  };
}

export function renderStudent(fake: ReturnType<typeof createFakeBridge>) {
  const user = userEvent.setup();
  const view = render(<StudentApp bridge={fake.bridge} />);
  return { ...view, user };
}
