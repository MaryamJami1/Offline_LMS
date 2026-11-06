import type { Branding } from '@lingualab/shared';

/**
 * The contract between the student app's main process and its screens. The
 * main process holds the device key and the tokens and talks to the server;
 * the screens see only what to show, through `window.lingualab`, which the
 * preload script exposes. Nothing here may need Node or Electron.
 */

/** Where this PC is, for S-01: "This PC: LAB1-A1 · Seat A1". */
export interface PcPlace {
  hostname: string;
  /** Null while the admin has not put the PC on a seat. */
  seatCode: string | null;
  labRoomName: string | null;
}

export interface StudentView {
  username: string;
  fullName: string;
}

/** What the app is showing. The main process decides; the screens follow. */
export type ShellState =
  | { screen: 'starting' }
  /** No answer from the server; it is asked again every 30 seconds. */
  | { screen: 'unreachable'; serverUrl: string }
  /** Registered, waiting for the admin to approve the PC; asked again every 30 seconds. */
  | { screen: 'waiting'; hostname: string }
  /** Something only the admin can put right: the message says what. */
  | { screen: 'refused'; message: string }
  | { screen: 'login'; place: PcPlace; notice?: string }
  | { screen: 'change-password'; place: PcPlace; student: StudentView }
  | { screen: 'home'; place: PcPlace; student: StudentView };

export type ProblemField = 'username' | 'password' | 'currentPassword' | 'newPassword' | 'pin';

/** What went wrong, already in words for the screen. */
export interface Problem {
  field?: ProblemField;
  message: string;
}

export type ActionResult = { ok: true } | { ok: false; problem: Problem };

export interface StudentBridge {
  getState(): Promise<ShellState>;
  /** Returns the function that stops listening. */
  onState(listener: (state: ShellState) => void): () => void;
  /** The admin pressed Ctrl+Alt+Shift+Q: show the PIN dialog. */
  onExitRequested(listener: () => void): () => void;
  branding(): Promise<Branding>;
  login(username: string, password: string): Promise<ActionResult>;
  changePassword(currentPassword: string, newPassword: string): Promise<ActionResult>;
  logout(): Promise<void>;
  /** Closes the app when the server says the PIN is right (STU-06). */
  exit(pin: string): Promise<ActionResult>;
}

/** IPC channel names, used by the main process and the preload script. */
export const IPC = {
  getState: 'shell:get-state',
  state: 'shell:state',
  exitRequested: 'shell:exit-requested',
  branding: 'shell:branding',
  login: 'shell:login',
  changePassword: 'shell:change-password',
  logout: 'shell:logout',
  exit: 'shell:exit',
} as const;

declare global {
  interface Window {
    lingualab: StudentBridge;
  }
}
