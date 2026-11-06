import {
  DEFAULT_BRANDING,
  INSTITUTE_TIME_ZONE,
  PASSWORD_MINIMUM_LENGTH,
  exitPinSchema,
  type Branding,
  type CurrentSeat,
  type LogoutReason,
} from '@lingualab/shared';
import type { ActionResult, PcPlace, Problem, ShellState, StudentView } from '../bridge.js';
import type { DeviceKeyStore } from './device-key-store.js';
import { createIdleWatcher, type IdleControl } from './idle-watcher.js';
import type { PcIdentity } from './pc-identity.js';
import { ServerError, ServerUnreachable, type ServerApi, type Tokens } from './server-api.js';

/** How often a PC that is waiting, refused or unreachable asks again, and a ready one checks in. */
export const RETRY_SECONDS = 30;

/** Renews the login well inside the access token's 15 minutes (04, Authentication). */
export const KEEPALIVE_MINUTES = 10;

/** Why the server ended a login without the app asking: End class comes with LAB-03. */
export type ServerEndReason = 'class_end' | 'replaced' | 'admin' | 'revoked';

export interface StudentShell {
  state(): ShellState;
  onState(listener: (state: ShellState) => void): () => void;
  start(): Promise<void>;
  /** For the screens, with the logo as a data URL; the default when the server cannot say. */
  branding(): Promise<Branding>;
  login(username: string, password: string): Promise<ActionResult>;
  changePassword(currentPassword: string, newPassword: string): Promise<ActionResult>;
  logout(): Promise<void>;
  /**
   * The server has already ended the login: the app forgets it and shows the
   * login, without asking the server. LAB-03 calls this with `class_end` when
   * the teacher presses End class.
   */
  endedByServer(reason: ServerEndReason): void;
  exit(pin: string): Promise<ActionResult>;
  /** Paused and resumed by teacher takeovers (STU-03). */
  idle: IdleControl;
}

const UNREACHABLE = 'The server cannot be reached. Check the network cable and try again.';
const SOMETHING_WRONG = 'Something went wrong. Try again, or ask your teacher.';
const SWITCH_ACCOUNT = 'Use Ctrl+Alt+Del to switch to the admin Windows account.';

const NOTICES = {
  idle: 'You were logged out after 30 minutes without use.',
  ended: 'You have been logged out. Log in again to carry on.',
  classEnd: 'The class has ended. You have been logged out.',
} as const;

const REFUSALS: Record<string, string> = {
  DEVICE_ALREADY_REGISTERED:
    'This PC is approved but has lost its key. Ask the admin to press Reset for it in Lab and seats.',
  DEVICE_RETIRED: 'This PC has been retired. Ask the admin to press Reset for it in Lab and seats.',
  TOO_MANY_WAITING:
    'Too many new PCs are waiting. Ask the admin to approve or remove some in Lab and seats.',
};

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTITUTE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function timeOfDay(iso: unknown): string | null {
  return typeof iso === 'string' && !Number.isNaN(Date.parse(iso))
    ? clock.format(new Date(iso))
    : null;
}

function failed(problem: Problem): ActionResult {
  return { ok: false, problem };
}

function codeOf(error: unknown): string | null {
  return error instanceof ServerError ? error.code : null;
}

interface Session {
  tokens: Tokens;
  student: StudentView;
  mustChangePassword: boolean;
}

/**
 * The student app's main-process logic, free of Electron so it can be tested
 * with fake timers: the PC joining the lab (ADM-04), logging in and out
 * (STU-01, STU-07) and closing with the admin PIN (STU-06).
 */
export function createStudentShell(options: {
  serverUrl: string;
  createApi: (deviceKey: () => string | null) => ServerApi;
  store: DeviceKeyStore;
  identity: PcIdentity;
  idleSeconds: () => number;
  quit: () => void;
}): StudentShell {
  const { identity, store } = options;
  let stored = store.load(identity.macs);
  const api = options.createApi(() => stored?.key ?? null);

  let state: ShellState = { screen: 'starting' };
  let place: PcPlace | null = null;
  let session: Session | null = null;
  const listeners = new Set<(state: ShellState) => void>();
  let poll: ReturnType<typeof setTimeout> | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const idle = createIdleWatcher({
    idleSeconds: options.idleSeconds,
    onIdle: () => void endSession('idle', NOTICES.idle),
  });

  function show(next: ShellState): void {
    state = next;
    for (const listener of listeners) {
      listener(next);
    }
  }

  /** The screen for where things stand: the login, or the student's own. */
  function showPlace(notice?: string): void {
    if (place === null) {
      return;
    }
    if (session === null) {
      show(notice === undefined ? { screen: 'login', place } : { screen: 'login', place, notice });
    } else {
      show({
        screen: session.mustChangePassword ? 'change-password' : 'home',
        place,
        student: session.student,
      });
    }
  }

  function placeOf(hostname: string, seat: CurrentSeat | null): PcPlace {
    return {
      hostname,
      seatCode: seat?.seatCode ?? null,
      labRoomName: seat?.labRoomName ?? null,
    };
  }

  function schedule(step: () => Promise<void>): void {
    if (poll !== null) {
      clearTimeout(poll);
    }
    poll = setTimeout(() => void step(), RETRY_SECONDS * 1000);
  }

  /** Forgets the login here; the caller says whether the server is told. */
  function dropSession(): Session | null {
    const ended = session;
    session = null;
    idle.stop();
    if (keepalive !== null) {
      clearInterval(keepalive);
      keepalive = null;
    }
    return ended;
  }

  async function endSession(reason: LogoutReason, notice?: string): Promise<void> {
    const ended = dropSession();
    showPlace(notice);
    if (ended !== null) {
      await api.logout(ended.tokens, reason).catch(() => undefined);
    }
  }

  function beginSession(next: Session): void {
    session = next;
    idle.start();
    keepalive = setInterval(() => void renew(), KEEPALIVE_MINUTES * 60_000);
  }

  async function renew(): Promise<void> {
    const current = session;
    if (current === null) {
      return;
    }
    try {
      current.tokens = await api.refresh(current.tokens.refreshToken);
    } catch (error) {
      // Unreachable: try again at the next renewal. Refused: the login is over.
      if (error instanceof ServerError && session === current) {
        endedByServer('revoked');
      }
    }
  }

  function endedByServer(reason: ServerEndReason): void {
    dropSession();
    showPlace(reason === 'class_end' ? NOTICES.classEnd : NOTICES.ended);
  }

  /** Registers or checks in, then asks where the PC is. */
  async function join(): Promise<void> {
    try {
      const mac = stored?.mac ?? identity.mac;
      const { answer } = await api.register({ ...identity, mac });
      if (answer.deviceKey !== null) {
        stored = { key: answer.deviceKey, mac };
        store.save(stored);
      }
      if (answer.status === 'waiting') {
        place = null;
        dropSession();
        show({ screen: 'waiting', hostname: identity.hostname });
        schedule(join);
        return;
      }
      await checkIn();
    } catch (error) {
      place = null;
      dropSession();
      if (error instanceof ServerUnreachable) {
        show({ screen: 'unreachable', serverUrl: options.serverUrl });
      } else {
        const code = codeOf(error);
        show({
          screen: 'refused',
          message: (code === null ? undefined : REFUSALS[code]) ?? SOMETHING_WRONG,
        });
      }
      schedule(join);
    }
  }

  /** Where this PC is now; asking also counts as the PC being seen (04). */
  async function checkIn(): Promise<void> {
    try {
      const me = await api.deviceMe();
      place = placeOf(me.hostname, me.seat);
      const notice = state.screen === 'login' ? state.notice : undefined;
      showPlace(notice);
      schedule(checkIn);
    } catch (error) {
      if (error instanceof ServerUnreachable && place !== null) {
        // A blip while someone works: carry on and ask again.
        schedule(checkIn);
        return;
      }
      // Reset or retired by the admin, which ended every login on it.
      await join();
    }
  }

  async function login(username: string, password: string): Promise<ActionResult> {
    const name = username.trim();
    if (name === '') {
      return failed({ field: 'username', message: 'Type your student ID' });
    }
    if (password === '') {
      return failed({ field: 'password', message: 'Type your password' });
    }
    if (place === null) {
      return failed({ message: UNREACHABLE });
    }
    try {
      const answer = await api.login(name, password);
      const tokens = { accessToken: answer.accessToken, refreshToken: answer.refreshToken };
      if (answer.user.role !== 'student') {
        await api.logout(tokens, 'manual').catch(() => undefined);
        return failed({ message: 'This app is for students. Teachers use the teacher console.' });
      }
      place = placeOf(place.hostname, answer.seat);
      beginSession({
        tokens,
        student: { username: answer.user.username, fullName: answer.user.fullName },
        mustChangePassword: answer.user.mustChangePassword,
      });
      showPlace();
      return { ok: true };
    } catch (error) {
      return failed(loginProblem(error));
    }
  }

  function loginProblem(error: unknown): Problem {
    if (error instanceof ServerUnreachable) {
      return { message: UNREACHABLE };
    }
    if (!(error instanceof ServerError)) {
      return { message: SOMETHING_WRONG };
    }
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return { field: 'password', message: 'Wrong student ID or password' };
      case 'ACCOUNT_LOCKED': {
        const time = timeOfDay(error.details['unlocksAt']);
        return {
          message:
            time === null
              ? 'Too many wrong passwords. Try again later.'
              : `Too many wrong passwords. Try again after ${time}.`,
        };
      }
      case 'ACCOUNT_INACTIVE':
        return { message: 'This account has been deactivated. Ask your teacher.' };
      case 'DEVICE_NOT_SEATED':
        return { message: 'This PC is not on a seat yet. Ask the admin.' };
      case 'DEVICE_NOT_APPROVED':
        void join();
        return { message: 'This PC is not approved yet. Ask the admin.' };
      default:
        return { message: SOMETHING_WRONG };
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const current = session;
    if (current === null) {
      return failed({ message: NOTICES.ended });
    }
    if (currentPassword === '') {
      return failed({ field: 'currentPassword', message: 'Type your current password' });
    }
    if (newPassword.length < PASSWORD_MINIMUM_LENGTH) {
      return failed({
        field: 'newPassword',
        message: `Use at least ${PASSWORD_MINIMUM_LENGTH} characters`,
      });
    }
    try {
      const answer = await api.changePassword(
        current.tokens.accessToken,
        currentPassword,
        newPassword,
      );
      current.tokens = { accessToken: answer.accessToken, refreshToken: answer.refreshToken };
      current.mustChangePassword = false;
      showPlace();
      return { ok: true } as const;
    } catch (error) {
      if (error instanceof ServerUnreachable) {
        return failed({ message: UNREACHABLE });
      }
      if (codeOf(error) === 'INVALID_CREDENTIALS') {
        return failed({ field: 'currentPassword', message: 'That is not your current password' });
      }
      if (codeOf(error) === 'VALIDATION_FAILED') {
        return failed({
          field: 'newPassword',
          message: `Use at least ${PASSWORD_MINIMUM_LENGTH} characters`,
        });
      }
      return failed({ message: SOMETHING_WRONG });
    }
  }

  async function exit(pin: string): Promise<ActionResult> {
    if (!exitPinSchema.safeParse(pin).success) {
      return failed({ field: 'pin', message: 'Type the six-digit PIN' });
    }
    try {
      await api.exit(pin);
    } catch (error) {
      if (error instanceof ServerUnreachable) {
        return failed({
          message: `The server cannot be reached, so the PIN cannot be checked. ${SWITCH_ACCOUNT}`,
        });
      }
      if (error instanceof ServerError && error.code === 'EXIT_PIN_WRONG') {
        const left = error.details['triesLeft'];
        return failed({
          field: 'pin',
          message:
            typeof left === 'number'
              ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`
              : 'Wrong PIN.',
        });
      }
      if (error instanceof ServerError && error.code === 'EXIT_PIN_LOCKED') {
        const time = timeOfDay(error.details['unlocksAt']);
        return failed({
          field: 'pin',
          message:
            time === null
              ? 'Too many wrong PINs. Try again later.'
              : `Too many wrong PINs. Try again after ${time}.`,
        });
      }
      if (codeOf(error) === 'DEVICE_NOT_APPROVED') {
        return failed({
          message: `This PC is not approved, so the PIN cannot be checked here. ${SWITCH_ACCOUNT}`,
        });
      }
      return failed({ message: SOMETHING_WRONG });
    }
    if (poll !== null) {
      clearTimeout(poll);
    }
    await endSession('manual');
    options.quit();
    return { ok: true };
  }

  return {
    state: () => state,
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      show({ screen: 'starting' });
      await join();
    },
    async branding() {
      try {
        const branding = await api.branding();
        const logoUrl = branding.logoUrl === null ? null : await api.logo(branding.logoUrl);
        return { ...branding, logoUrl };
      } catch {
        return DEFAULT_BRANDING;
      }
    },
    login,
    changePassword,
    logout: () => endSession('manual'),
    endedByServer,
    exit,
    idle: {
      pause: () => idle.pause(),
      resume: () => idle.resume(),
    },
  };
}
